import { useEffect, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import * as L from "leaflet";
import "leaflet.locatecontrol"; // plugin side-effect augment

interface Props {
  isActive?: boolean;
}

const LocateControlComponent = ({ isActive = false }: Props) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [locationInstance, setLocationInstance] =
    //@ts-ignore
    useState<L.Control.Locate | null>(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef?.leafletMap) {
      const mapInstance = routedMapRef.leafletMap.leafletElement;
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
          locateOptions: {
            enableHighAccuracy: true,
          },
          showCompass: true,
          setView: "untilPan",
          keepCurrentZoomLevel: true,
          flyTo: false,
          drawCircle: true,
        })
        .addTo(mapInstance);
      setLocationInstance(lc);
    }

    return () => {
      if (locationInstance) {
        locationInstance.stop();
      }
    };
  }, [routedMapRef, locationInstance]);

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
