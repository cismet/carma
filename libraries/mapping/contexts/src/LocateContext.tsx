/**
 * LocateContext - the one "where is the user" state of a MapLibre map
 *
 * The location mode behind the mobile locate button: the browser's geolocation,
 * a blue dot and an accuracy circle on the map. It is a context rather than a
 * hook each caller runs for itself, because everything that wants the user's
 * position wants the same one: the button switches it on, the infobox routes
 * from it, the origin search measures "In der Nähe" from it. Three copies of
 * the hook meant three `watchPosition`s and three blue dots on top of each
 * other, and a button that showed as off while another caller had it running.
 *
 * `LibreContextProvider` renders it with its own map, so every app that has a
 * MapLibre map has this too and no app mounts anything.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import { subscribeCompassHeading } from "./locate/compass-heading";
import { getGeolocationSource } from "./locate/geolocation-source";
import type { GeolocationSource } from "./locate/geolocation-source";
import {
  createAccuracyCircleGeoJSON,
  createLocateMarkerElement,
  LOCATE_MARKER_OPTIONS,
} from "./locate/locate-marker";
import type { LocateMarkerElement } from "./locate/locate-marker";

/**
 * Why there is no position, for the caller that has to say so on screen. Told
 * apart because "you said no" and "the device could not tell" are different
 * things to read, and only the first is something the user can undo.
 */
export type LocateProblem =
  /** the permission was declined, here or for the site as a whole */
  | "denied"
  /** the device could not produce a fix */
  | "unavailable"
  /** the device did not answer in time; a slow fix, not a refusal */
  | "timeout"
  /** no geolocation api in this browser */
  | "unsupported";

export interface LocateContextType {
  /** the location mode is on: the dot is on the map and the watch is running */
  isLocationActive: boolean;
  /** waiting for the first fix, the permission prompt included */
  isLoading: boolean;
  /** the view has been moved since the last fix, so the dot may be off screen */
  hasMapMoved: boolean;
  currentPosition: GeolocationPosition | null;
  /** why the last attempt produced nothing; null while it has not failed */
  problem: LocateProblem | null;
  /**
   * Switch the mode on. `fly` moves the map to the position at zoom 16, which
   * is what the button does; a caller that only needs the coordinates passes
   * `false` and leaves the view where the user put it.
   */
  activate: (options?: { fly?: boolean }) => void;
  deactivate: () => void;
  toggle: () => void;
}

const INERT: LocateContextType = {
  isLocationActive: false,
  isLoading: false,
  hasMapMoved: false,
  currentPosition: null,
  problem: null,
  activate: () => {},
  deactivate: () => {},
  toggle: () => {},
};

export const LocateContext = createContext<LocateContextType>(INERT);

/** the zoom the map goes to when it follows the user */
const LOCATE_ZOOM = 16;

interface LocateProviderProps {
  map: MapLibreMap | null;
  children: ReactNode;
}

export const LocateProvider = ({ map, children }: LocateProviderProps) => {
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPosition, setCurrentPosition] =
    useState<GeolocationPosition | null>(null);
  const [problem, setProblem] = useState<LocateProblem | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const accuracyCircleRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  /**
   * The source the running watch was started on. The slot may change while
   * the watch runs (a simulator mounting or going), and a watch id only means
   * something to the source that handed it out.
   */
  const watchSourceRef = useRef<GeolocationSource | null>(null);
  /** whether this activation moves the map; see `activate` */
  const flyRef = useRef(true);
  /**
   * Whether the map follows the user: on for a flying activation until the
   * user moves the map by hand. A ref because the watch callback reads it and
   * would otherwise see the value from when the watch was started.
   */
  const followRef = useRef(false);
  /**
   * The marker is created behind a dynamic import, and until that resolves
   * there is nothing in `markerRef` to say one is on its way. The first fix and
   * the watch's first tick arrive together, so without these two the second
   * call started a second marker, the ref kept the last one, and the other was
   * left on the map with no handle to remove it: a blue dot that survived
   * switching the mode off.
   */
  const markerPendingRef = useRef(false);
  /** where that pending marker goes, kept current while it is on its way */
  const markerLngLatRef = useRef<[number, number] | null>(null);
  /** whether the mode is still on by the time the import resolves */
  const isActiveRef = useRef(false);
  /** the dot with its heading arrow, built before the marker exists */
  const markerElementRef = useRef<LocateMarkerElement | null>(null);
  /**
   * The compass heading in degrees from north, null while the device has not
   * given one. Refs, not state: orientation events come many times a second
   * and only the marker needs to know.
   */
  const headingRef = useRef<number | null>(null);
  const unsubscribeHeadingRef = useRef<(() => void) | null>(null);

  const applyHeading = useCallback(() => {
    markerElementRef.current?.setHeading(headingRef.current, markerRef.current);
  }, []);

  const stopHeading = useCallback(() => {
    unsubscribeHeadingRef.current?.();
    unsubscribeHeadingRef.current = null;
  }, []);

  const startHeading = useCallback(() => {
    if (unsubscribeHeadingRef.current) {
      return;
    }
    unsubscribeHeadingRef.current = subscribeCompassHeading((heading) => {
      headingRef.current = heading;
      applyHeading();
    });
  }, [applyHeading]);

  const clearLocationMarker = useCallback(() => {
    markerLngLatRef.current = null;
    markerElementRef.current = null;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (map && accuracyCircleRef.current) {
      if (map.getLayer(accuracyCircleRef.current)) {
        map.removeLayer(accuracyCircleRef.current);
      }
      if (map.getSource(accuracyCircleRef.current)) {
        map.removeSource(accuracyCircleRef.current);
      }
      accuracyCircleRef.current = null;
    }
  }, [map]);

  const updateLocationMarker = useCallback(
    (position: GeolocationPosition) => {
      // a fix can arrive after the mode was switched off: `getCurrentPosition`
      // cannot be called back, and drawing its answer would leave the dot and
      // the accuracy circle behind
      if (!map || !isActiveRef.current) return;

      const { latitude, longitude, accuracy } = position.coords;
      markerLngLatRef.current = [longitude, latitude];

      // Create or update marker
      if (markerRef.current) {
        markerRef.current.setLngLat([longitude, latitude]);
      } else if (!markerPendingRef.current) {
        markerPendingRef.current = true;

        const markerElement = createLocateMarkerElement();
        markerElementRef.current = markerElement;

        // Dynamic import to avoid SSR issues
        import("maplibre-gl").then(({ Marker }) => {
          markerPendingRef.current = false;
          // switched off while the import was on its way: adding it now would
          // put a dot on the map that nothing is going to take off again
          if (!isActiveRef.current || !markerLngLatRef.current) {
            return;
          }
          markerRef.current = new Marker({
            element: markerElement.element,
            ...LOCATE_MARKER_OPTIONS,
          })
            .setLngLat(markerLngLatRef.current)
            .addTo(map);
          // a heading may have arrived while the import was on its way
          applyHeading();
        });
      }

      // Create or update accuracy circle
      const sourceId = "locate-accuracy-circle";
      const circleGeoJSON = createAccuracyCircleGeoJSON(
        longitude,
        latitude,
        accuracy
      );

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as any).setData(circleGeoJSON);
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data: circleGeoJSON,
        });
        map.addLayer({
          id: sourceId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": "#4285f4",
            "fill-opacity": 0.15,
          },
        });
        accuracyCircleRef.current = sourceId;
      }
    },
    [map, applyHeading]
  );

  const startLocating = useCallback(() => {
    isActiveRef.current = true;
    const geolocation = getGeolocationSource();
    if (!geolocation) {
      console.error("Geolocation is not supported by this browser.");
      setProblem("unsupported");
      setIsLoading(false);
      setIsLocationActive(false);
      return;
    }

    setIsLoading(true);
    setProblem(null);
    followRef.current = flyRef.current;
    startHeading();

    geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition(position);
        setIsLoading(false);
        updateLocationMarker(position);

        if (map && followRef.current) {
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: LOCATE_ZOOM,
          });
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        setProblem(
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "unavailable"
        );
        setIsLoading(false);
        setIsLocationActive(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    watchSourceRef.current = geolocation;
    watchIdRef.current = geolocation.watchPosition(
      (position) => {
        setCurrentPosition(position);
        updateLocationMarker(position);

        // keep the user in the middle of the view, at the locate zoom, until
        // they take the map somewhere else themselves
        if (map && isActiveRef.current && followRef.current) {
          map.easeTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: LOCATE_ZOOM,
          });
        }
      },
      (error) => {
        console.error("Error watching location:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [map, updateLocationMarker, startHeading]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      watchSourceRef.current?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      watchSourceRef.current = null;
    }
  }, []);

  const stopLocating = useCallback(() => {
    isActiveRef.current = false;
    clearWatch();
    stopHeading();
    clearLocationMarker();
    followRef.current = false;
    setCurrentPosition(null);
    setHasMapMoved(false);
  }, [clearWatch, clearLocationMarker, stopHeading]);

  useEffect(() => {
    if (!map || !isLocationActive) return;

    // only moves the user made count: the flight to the position and the
    // recentering on each fix are ours and carry no `originalEvent`, and
    // reading them as "moved" switched the button off right after it went on
    const handleMapMove = (event: { originalEvent?: Event }) => {
      if (!event.originalEvent) return;
      followRef.current = false;
      setHasMapMoved(true);
    };

    map.on("dragend", handleMapMove);
    map.on("zoomend", handleMapMove);

    return () => {
      map.off("dragend", handleMapMove);
      map.off("zoomend", handleMapMove);
    };
  }, [map, isLocationActive]);

  useEffect(() => {
    if (isLocationActive) {
      startLocating();
    } else {
      stopLocating();
    }
  }, [isLocationActive, startLocating, stopLocating]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearWatch();
      stopHeading();
      clearLocationMarker();
    };
  }, [clearWatch, clearLocationMarker, stopHeading]);

  const activate = useCallback((options?: { fly?: boolean }) => {
    // the flag belongs to the activation, not to the mode: whoever switches it
    // on says whether the map goes there, and the button still does
    flyRef.current = options?.fly ?? true;
    // a caller that asks for the coordinates only, while the button already
    // has the mode following, takes the following off: it is about to move
    // the map itself (the routing camera), and two hands on the camera fight
    if (options?.fly === false) {
      followRef.current = false;
    }
    setIsLocationActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setIsLocationActive(false);
  }, []);

  const toggle = useCallback(() => {
    flyRef.current = true;
    setIsLocationActive((previous) => !previous);
  }, []);

  return (
    <LocateContext.Provider
      value={{
        isLocationActive,
        isLoading,
        hasMapMoved,
        currentPosition,
        problem,
        activate,
        deactivate,
        toggle,
      }}
    >
      {children}
    </LocateContext.Provider>
  );
};

export const useLocate = () => useContext(LocateContext);
