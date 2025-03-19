import { useEffect, useContext, useState } from "react";

import type LocateControl from "leaflet.locatecontrol";
import { control } from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

const LocateControlComponent = ({ isActive = false }) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(
    TopicMapContext
  ) as any;
  const [locationInstance, setLocationInstance] =
    useState<LocateControl | null>(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef?.leafletMap) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
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
        .addTo(mapExample);
      setLocationInstance(lc);
    }

    return () => {
      if (locationInstance) {
        locationInstance.stop();
      }
    };
  }, [routedMapRef]);

  useEffect(() => {
    if (locationInstance) {
      if (isActive) {
        locationInstance.start();
      } else {
        locationInstance.stop();
      }
    }
  }, [isActive, locationInstance]);

  return null;
};

export default LocateControlComponent;
