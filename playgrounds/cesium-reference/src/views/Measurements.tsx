import React, { useState, useCallback, useRef } from "react";
import { Flex } from "antd";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import {
  CesiumViewerProvider,
  useCesiumViewer,
} from "../contexts/CesiumViewerContext";
import {
  CesiumMeasurementsProvider,
  useCesiumMeasurements,
} from "../measurements/CesiumMeasurementsContext";
import useCesiumPointQuery from "../measurements/hooks/useCesiumPointQuery";
import useNivPPoints from "../measurements/hooks/useNivPPoints";
import ScreenLayout from "../components/ScreenLayout";
import PointMeasurementPanel from "../measurements/components/PointMeasurementPanel";
import DistanceMeasurementPanel from "../measurements/components/DistanceMeasurementPanel";
import { InteractiveModeTabs } from "../measurements/components/InteractiveModeTabs";

import { cesiumConstructorOptions } from "../config";
import PointControls from "../measurements/components/PointControls";
import {
  ElevationStandard,
  PointInfoData,
} from "../measurements/types/MeasurementTypes";
import { MeasurementMode } from "../measurements/hooks/useMeasurement";
import HomeButton from "../components/HomeButton";
import { useCesiumDistanceMeasurement } from "../measurements/hooks/useCesiumDistanceMeasurement";

// Inner component that has access to contexts
const InnerMeshElevations: React.FC<{
  coordinateDisplayMode: "cartesian" | "cartographic" | "utm32";
  onCoordinateDisplayModeChange: (
    value: "cartesian" | "cartographic" | "utm32"
  ) => void;
}> = ({ coordinateDisplayMode, onCoordinateDisplayModeChange }) => {
  const [showNivPPoints, setShowNivPPoints] = useState(true);
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn");
  const [includeHistoric, setIncludeHistoric] = useState(false);

  const { viewerRef, zoomToTileset } = useCesiumViewer();
  const {
    measurementCount,
    measurementMode,
    searchRadius,
    pointData,
    setPointData,
  } = useCesiumMeasurements();

  const { entities: nivPEntities } = useNivPPoints(
    showNivPPoints ? viewerRef.current : null,
    elevationStandard,
    FESTPUNKTE_WUPPERTAL,
    includeHistoric
  );

  const handleShowInfo = useCallback(
    (data: PointInfoData) => {
      console.log("[Measurements] Point clicked:", data);
      setPointData(data);
    },
    [setPointData]
  );

  useCesiumPointQuery(
    viewerRef.current,
    measurementMode === MeasurementMode.PointQuery,
    nivPEntities,
    searchRadius,
    handleShowInfo
  );

  useCesiumDistanceMeasurement(
    measurementMode === MeasurementMode.Distance,
    coordinateDisplayMode
  );

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
          <InnerMeshElevations
            coordinateDisplayMode={coordinateDisplayMode}
            onCoordinateDisplayModeChange={setCoordinateDisplayMode}
          />
        </CesiumMeasurementsProvider>
      </CesiumViewerProvider>
    </>
  );
};

export default TestMeshElevations;
