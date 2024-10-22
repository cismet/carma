import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import type LocateControl from "leaflet.locatecontrol";
import { control } from "leaflet";

import { getLeafletElement } from "../../../store/slices/topicmap";

const LocateControlComponent = ({ startLocate = 0 }) => {
  const leafletElement = useSelector(getLeafletElement);

  const [locationInstance, setLocationInstance] =
    useState<LocateControl | null>(null);

  useEffect(() => {
    if (!locationInstance && leafletElement) {
      const lc = (control as LocateControl)
        .locate({
          position: "topright",
          locateOptions: {
            enableHighAccuracy: true,
          },
          showCompass: true,
          setView: "untilPan",
          keepCurrentZoomLevel: "true",
          flyTo: false,
          drawCircle: true,
        })
        .addTo(leafletElement);
      setLocationInstance(lc);
    }

    // return () => {
    //   lc.remove();
    // };
  }, [leafletElement]);

  useEffect(() => {
    if (startLocate && locationInstance) {
      locationInstance.start();
    }
  }, [startLocate]);

  return null;
};

export default LocateControlComponent;
