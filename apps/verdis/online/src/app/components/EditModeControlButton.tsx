import React, { useEffect } from "react";
import L from "leaflet";
import "leaflet-editable";

interface EditModeControlButtonProps {
  mapRef: React.RefObject<any>;
  featuresInEditMode: boolean;
  position?: L.ControlPosition;
  html?: string;
  kind?: string;
  selectedFeatureId: any;
}

const EditModeControlButton: React.FC<EditModeControlButtonProps> = ({
  mapRef,
  featuresInEditMode,
  selectedFeatureId,
}) => {
  useEffect(() => {
    const map = mapRef.current.leafletMap.leafletElement;

    if (!map) return;

    const reapplyEdit = () => {
      map.eachLayer((layer: any) => {
        const isMyAnnotation =
          layer.feature?.properties?.type === "annotation" &&
          layer.feature.id === selectedFeatureId?.id;

        if (isMyAnnotation && featuresInEditMode) {
          if (typeof layer.enableEdit === "function") {
            layer.enableEdit();
          }
        } else {
          if (typeof layer.disableEdit === "function") {
            layer.disableEdit();
          }
        }
      });
    };

    reapplyEdit();

    map.on("moveend", reapplyEdit);
    map.on("zoomend", reapplyEdit);

    return () => {
      // map.removeControl(control);
      map.off("moveend", reapplyEdit);
      map.off("zoomend", reapplyEdit);
    };
  }, [mapRef, featuresInEditMode, selectedFeatureId]);

  return null;
};

export default EditModeControlButton;
