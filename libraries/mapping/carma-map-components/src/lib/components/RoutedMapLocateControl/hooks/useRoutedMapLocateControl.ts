import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import type LocateControl from "leaflet.locatecontrol";
import { control } from "leaflet";

export const useRoutedMapLocateControl = () => {
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [hasFoundLocation, setHasFoundLocation] = useState(false);
  const [locationInstance, setLocationInstance] =
    useState<LocateControl | null>(null);

  useEffect(() => {
    if (routedMap) {
      const map = routedMap.leafletMap.leafletElement;

      const handleMapMove = () => {
        if (isLocationActive && hasFoundLocation) {
          setHasMapMoved(true);
        }
      };

      const handleLocationFound = () => {
        setTimeout(() => {
          setHasFoundLocation(true);
        }, 300);
      };

      map.on("move", handleMapMove);
      map.on("locationfound", handleLocationFound);

      return () => {
        map.off("move", handleMapMove);
        map.off("locationfound", handleLocationFound);
      };
    }
  }, [routedMap, isLocationActive, hasFoundLocation]);

  useEffect(() => {
    if (!isLocationActive) {
      setHasMapMoved(false);
      setHasFoundLocation(false);
    }
  }, [isLocationActive]);

  useEffect(() => {
    if (!locationInstance && routedMap) {
      const targetMap = routedMap.leafletMap.leafletElement;
      const lc = (control as LocateControl)
        .locate({
          position: "topright",
          strings: {
            title: "Mein Standort",
            metersUnit: "Meter",
            feetUnit: "feet",
            popup: `Ihre reale Position kann bis<br/>zu {distance} {unit}<br/> von diesem Punkt abweichen.`,
            outsideMapBoundsMsg:
              "Sie befinden sich außerhalb der Kartengrenzen.",
          },
          locateOptions: {
            enableHighAccuracy: true,
          },
          showCompass: true,
          setView: "untilPan",
          keepCurrentZoomLevel: "true",
          flyTo: false,
          drawCircle: true,
        })
        .addTo(targetMap);
      setLocationInstance(lc);
    }

    return () => {
      if (locationInstance) {
        locationInstance.stop();
      }
    };
  }, [routedMap]);

  useEffect(() => {
    if (locationInstance) {
      if (isLocationActive) {
        locationInstance.start();
      } else {
        locationInstance.stop();
      }
    }
  }, [isLocationActive, locationInstance]);

  return {
    isLocationActive,
    setIsLocationActive,
    hasMapMoved,
  };
};
