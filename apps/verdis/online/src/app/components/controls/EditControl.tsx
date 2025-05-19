import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import EditModeControlButton from "../EditModeControlButton";

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
  const map: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

  const toggleEditMode = () => {
    setFeaturesInEditMode(!featuresInEditMode);
  };

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
          }}
        >
          <i className="fas fa-edit"></i>
        </div>
      </ControlButtonStyler>
      <EditModeControlButton
        mapRef={routedMapRef}
        featuresInEditMode={featuresInEditMode}
        onFeatureChange={setFeaturesInEditMode}
        selectedFeatureId={selectedFeatureId}
      />
    </>
  );
};
