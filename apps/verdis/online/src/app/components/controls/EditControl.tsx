import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import EditModeControlButton from "../EditModeControlButton";
import { useDispatch, useSelector } from "react-redux";
import { getDrawMode, setDrawMode } from "../../../store/slices/ui";

interface PolygonControlProps {
  routedMapRef: React.RefObject<any>;
  featuresInEditMode: boolean;
  setFeaturesInEditMode: (editing: boolean) => void;
  selectedFeatureId: any;
}

export const EditControl = ({
  routedMapRef,
  featuresInEditMode,
  setFeaturesInEditMode,
  selectedFeatureId,
}: PolygonControlProps) => {
  const dispatch = useDispatch();
  const mode = useSelector(getDrawMode);

  const toggleEditMode = () => {
    setFeaturesInEditMode(!featuresInEditMode);
    if (featuresInEditMode) {
      dispatch(setDrawMode("default"));
    } else {
      dispatch(setDrawMode("edit-feature"));
    }
  };

  useEffect(() => {
    if (mode === "default" || mode === "marker" || mode === "polygon") {
      setFeaturesInEditMode(false);
    }
  }, [mode]);

  return (
    <>
      <ControlButtonStyler
        onClick={toggleEditMode}
        title="Verändern der selektierten Anmerkung"
      >
        <div
          style={{
            border: featuresInEditMode
              ? "3px solid #008AFA"
              : "3px solid transparent",
            width: "28px",
            height: "28px",
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
          }}
        >
          <i className="fas fa-edit"></i>
        </div>
      </ControlButtonStyler>
      <EditModeControlButton
        mapRef={routedMapRef}
        featuresInEditMode={featuresInEditMode}
        selectedFeatureId={selectedFeatureId}
      />
    </>
  );
};
