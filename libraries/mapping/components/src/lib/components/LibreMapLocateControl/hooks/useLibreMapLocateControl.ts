import { useEffect, useState, useCallback, useRef } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

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
  const accuracyCircleRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const clearLocationMarker = useCallback(() => {
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

      // Create or update marker
      if (!markerRef.current) {
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
          markerRef.current = new Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(map);
        });
      } else {
        markerRef.current.setLngLat([longitude, latitude]);
      }

      // Create or update accuracy circle
      const sourceId = "locate-accuracy-circle";
      const circleGeoJSON = createCircleGeoJSON(longitude, latitude, accuracy);

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
        updateLocationMarker(position);

        if (map) {
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 16,
          });
        }
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
      if (currentPosition) {
        setHasMapMoved(true);
      }
    };

    map.on("dragend", handleMapMove);
    map.on("zoomend", handleMapMove);

    return () => {
      map.off("dragend", handleMapMove);
      map.off("zoomend", handleMapMove);
    };
  }, [map, isLocationActive, currentPosition]);

  useEffect(() => {
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
