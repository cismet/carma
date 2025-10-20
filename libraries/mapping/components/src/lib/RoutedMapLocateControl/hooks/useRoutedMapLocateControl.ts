import { useContext, useEffect, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import * as L from "leaflet";
import "leaflet.locatecontrol"; // side-effect plugin augments leaflet (runtime only)

export const useRoutedMapLocateControl = () => {
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [hasFoundLocation, setHasFoundLocation] = useState(false);
  const [locationInstance, setLocationInstance] =
    //@ts-ignore
    useState<L.Control.Locate | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (routedMap) {
      const map = routedMap.leafletMap.leafletElement;

      const handleMapMove = () => {
        if (isLocationActive && hasFoundLocation) {
          setHasMapMoved(true);
        }
      };

      const handleLocationFound = () => {
        console.log("xxx location found");
        setTimeout(() => {
          setIsLoading(false);
          setHasFoundLocation(true);
        }, 300);
      };

      const handleError = () => {
        setIsLoading(false);
        setIsLocationActive(false);
      };

      map.on("dragend zoomend", handleMapMove);
      map.on("locationfound", handleLocationFound);
      map.on("locationerror", handleError);

      return () => {
        map.off("dragend", handleMapMove);
        map.off("zoomend", handleMapMove);
        map.off("locationfound", handleLocationFound);
        map.off("locationerror", handleError);
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
      const lc = L.control
        //@ts-ignore
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
          flyTo: false,
          drawCircle: true,
        })
        .addTo(targetMap);
      setLocationInstance(lc);
    }

    return () => {
      if (locationInstance) {
        try {
          locationInstance.stop();
        } catch (e) {
          console.log("xxx error stopping location instance", e);
        }
      }
    };
  }, [routedMap, locationInstance]);

  useEffect(() => {
    if (locationInstance) {
      if (isLocationActive) {
        setIsLoading(true);
        locationInstance.start();
      } else {
        setIsLoading(false);
        try {
          locationInstance.stop();
        } catch (e) {
          console.log("xxx error stopping location instance", e);
        }
      }
    }
  }, [isLocationActive, locationInstance]);

  return {
    isLocationActive,
    setIsLocationActive,
    hasMapMoved,
    isLoading,
  };
};
