import React, { useState, useRef } from "react";
import { Flex } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import {
  CesiumViewerProvider,
  useCesiumViewer,
} from "../contexts/CesiumViewerContext";
import { CesiumMeasurementsProvider } from "../measurements/CesiumMeasurementsContext";
import ScreenLayout from "../components/ScreenLayout";
import PointMeasurementPanel from "../measurements/components/PointMeasurementPanel";
import DistanceMeasurementPanel from "../measurements/components/DistanceMeasurementPanel";
import { InteractiveModeTabs } from "../measurements/components/InteractiveModeTabs";

import { cesiumConstructorOptions } from "../config";
import PointControls from "../measurements/components/PointControls";
import { ElevationStandard } from "../measurements/types/MeasurementTypes";
import HomeButton from "../components/HomeButton";

// Inner component that has access to contexts
const ContextAwareApp: React.FC<{
  coordinateDisplayMode: "cartesian" | "cartographic" | "utm32";
  onCoordinateDisplayModeChange: (
    value: "cartesian" | "cartographic" | "utm32"
  ) => void;
}> = ({ coordinateDisplayMode, onCoordinateDisplayModeChange }) => {
  const [showNivPPoints, setShowNivPPoints] = useState(true);
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn");
  const [includeHistoric, setIncludeHistoric] = useState(false);

  const { zoomToTileset } = useCesiumViewer();

  const TopRightPanel: React.FC = () => {
    return (
      <Flex vertical gap={2}>
        <InteractiveModeTabs
          coordinateDisplayMode={coordinateDisplayMode}
          onCoordinateDisplayModeChange={onCoordinateDisplayModeChange}
        />
        <PointMeasurementPanel />
        <DistanceMeasurementPanel
          coordinateDisplayMode={coordinateDisplayMode}
        />
      </Flex>
    );
  };

  return (
    <>
      <ScreenLayout
        topLeft={
          <PointControls
            showNivPPoints={showNivPPoints}
            onShowNivPPointsChange={setShowNivPPoints}
            elevationStandard={elevationStandard}
            onElevationStandardChange={setElevationStandard}
            includeHistoric={includeHistoric}
            onIncludeHistoricChange={setIncludeHistoric}
            pointCount={0}
          />
        }
        topRight={<TopRightPanel />}
        bottomCenter={<HomeButton onHomeClick={zoomToTileset} />}
      />
    </>
  );
};

const TestMeshElevations: React.FC = () => {
  const [coordinateDisplayMode, setCoordinateDisplayMode] = useState<
    "cartesian" | "cartographic" | "utm32"
  >("cartesian");
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100vh",
        }}
      />
      <CesiumViewerProvider
        containerRef={containerRef}
        options={{
          cesiumOptions: cesiumConstructorOptions,
          tilesetUrl: WUPP_MESH_2024.url,
          tilesetOptions: {
            skipLevelOfDetail: true,
            immediatelyLoadDesiredLevelOfDetail: true,
            maximumScreenSpaceError: 1,
            show: true,
          },
          cameraPersistence: {
            autoSave: true,
            saveDelay: 1000,
            autoRestore: true,
          },
        }}
      >
        <CesiumMeasurementsProvider>
          <ContextAwareApp
            coordinateDisplayMode={coordinateDisplayMode}
            onCoordinateDisplayModeChange={setCoordinateDisplayMode}
          />
        </CesiumMeasurementsProvider>
      </CesiumViewerProvider>
    </>
  );
};

export default TestMeshElevations;
