import { useEffect, useState, useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";

const ACCURACY_SOURCE_ID = "locate-accuracy-circle";

interface UseLibreMapLocateControlProps {
  map: MapLibreMap | null;
}

export const useLibreMapLocateControl = ({
  map,
}: UseLibreMapLocateControlProps) => {
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPosition, setCurrentPosition] =
    useState<GeolocationPosition | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // the Marker class is imported lazily, so a second position update can
  // arrive while the first one is still waiting for the module. Without this
  // guard every update before the import resolves creates its own marker.
  const markerPendingRef = useRef(false);
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const accuracyCircleRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  // the recentring below is a map move like any other; without this the
  // control would immediately report "user has panned away"
  const ignoreNextMoveRef = useRef(false);

  const clearLocationMarker = useCallback(() => {
    markerPendingRef.current = false;
    latestPositionRef.current = null;
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
      if (!map) return;

      const { latitude, longitude, accuracy } = position.coords;
      latestPositionRef.current = position;

      // Create or update marker
      if (!markerRef.current) {
        if (!markerPendingRef.current) {
          markerPendingRef.current = true;
          const el = document.createElement("div");
          el.className = "libre-locate-marker";
          el.style.cssText = `
            width: 18px;
            height: 18px;
            background: #4285f4;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
          `;

          // Dynamic import to avoid SSR issues
          import("maplibre-gl").then(({ Marker }) => {
            markerPendingRef.current = false;
            // the control was switched off while the module was loading
            if (!isActiveRef.current) return;
            const latest = latestPositionRef.current ?? position;
            markerRef.current = new Marker({ element: el })
              .setLngLat([latest.coords.longitude, latest.coords.latitude])
              .addTo(map);
          });
        }
      } else {
        markerRef.current.setLngLat([longitude, latitude]);
      }

      updateAccuracyCircle(
        map,
        longitude,
        latitude,
        accuracy,
        accuracyCircleRef
      );
    },
    [map]
  );

  const startLocating = useCallback(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      setIsLoading(false);
      setIsLocationActive(false);
      return;
    }

    setIsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition(position);
        setIsLoading(false);

        // recentre first: a failure while drawing the marker must never cost
        // the user the one thing the control is for
        if (map) {
          ignoreNextMoveRef.current = true;
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 16,
            essential: true,
          });
        }

        updateLocationMarker(position);
      },
      (error) => {
        console.error("Error getting location:", error);
        setIsLoading(false);
        setIsLocationActive(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition(position);
        updateLocationMarker(position);
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
  }, [map, updateLocationMarker]);

  const stopLocating = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLocationMarker();
    setCurrentPosition(null);
    setHasMapMoved(false);
  }, [clearLocationMarker]);

  useEffect(() => {
    if (!map || !isLocationActive) return;

    const handleMapMove = () => {
      if (ignoreNextMoveRef.current) {
        ignoreNextMoveRef.current = false;
        return;
      }
      if (latestPositionRef.current) {
        setHasMapMoved(true);
      }
    };

    map.on("dragend", handleMapMove);
    map.on("zoomend", handleMapMove);

    return () => {
      map.off("dragend", handleMapMove);
      map.off("zoomend", handleMapMove);
    };
  }, [map, isLocationActive]);

  // a style swap (background change, layer edit) drops every source and layer
  // the control added, so they have to go back in once the new style is up
  useEffect(() => {
    if (!map || !isLocationActive) return;

    const handleStyleData = () => {
      const position = latestPositionRef.current;
      if (!position) return;
      if (accuracyCircleRef.current && map.getSource(ACCURACY_SOURCE_ID))
        return;
      accuracyCircleRef.current = null;
      const { latitude, longitude, accuracy } = position.coords;
      updateAccuracyCircle(
        map,
        longitude,
        latitude,
        accuracy,
        accuracyCircleRef
      );
    };

    map.on("styledata", handleStyleData);
    return () => {
      map.off("styledata", handleStyleData);
    };
  }, [map, isLocationActive]);

  useEffect(() => {
    isActiveRef.current = isLocationActive;
    if (isLocationActive) {
      startLocating();
    } else {
      stopLocating();
    }
  }, [isLocationActive, startLocating, stopLocating]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      clearLocationMarker();
    };
  }, [clearLocationMarker]);

  return {
    isLocationActive,
    setIsLocationActive,
    hasMapMoved,
    isLoading,
    currentPosition,
  };
};

/**
 * Adds or moves the translucent accuracy disc.
 *
 * `addSource` throws "Style is not done loading" while a style is still being
 * applied, and geoportal reapplies its style on every layer change, so the
 * call is deferred to the next `idle` instead of being allowed to escape into
 * the geolocation callback.
 */
function updateAccuracyCircle(
  map: MapLibreMap,
  lng: number,
  lat: number,
  accuracy: number,
  accuracyCircleRef: MutableRefObject<string | null>
) {
  const circleGeoJSON = createCircleGeoJSON(lng, lat, accuracy);

  const existing = map.getSource(ACCURACY_SOURCE_ID);
  if (existing) {
    (existing as GeoJSONSource).setData(circleGeoJSON);
    accuracyCircleRef.current = ACCURACY_SOURCE_ID;
    return;
  }

  if (!map.isStyleLoaded()) {
    map.once("idle", () => {
      if (
        accuracyCircleRef.current === null &&
        !map.getSource(ACCURACY_SOURCE_ID)
      ) {
        updateAccuracyCircle(map, lng, lat, accuracy, accuracyCircleRef);
      }
    });
    return;
  }

  map.addSource(ACCURACY_SOURCE_ID, {
    type: "geojson",
    data: circleGeoJSON,
  });
  map.addLayer({
    id: ACCURACY_SOURCE_ID,
    type: "fill",
    source: ACCURACY_SOURCE_ID,
    paint: {
      "fill-color": "#4285f4",
      "fill-opacity": 0.15,
    },
  });
  accuracyCircleRef.current = ACCURACY_SOURCE_ID;
}

function createCircleGeoJSON(
  lng: number,
  lat: number,
  radiusInMeters: number
): GeoJSON.FeatureCollection {
  const points = 64;
  const coords: [number, number][] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);

    // Convert meters to degrees (approximate)
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    const dLat = dy / 110540;

    coords.push([lng + dLng, lat + dLat]);
  }
  coords.push(coords[0]);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      },
    ],
  };
}
