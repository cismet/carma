import { useRef, useState, useCallback } from "react";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder, cesiumSafeRequestRender } from "@carma-mapping/cesium-engine";

import { useTestMeshViewer } from "../hooks/usePersistentViewer";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import useSceneClick from "../hooks/useSceneClick";
import useMeasurement from "../hooks/useMeasurement";
import PointControls from "../components/PointControls";
import InfoPanel, { type InfoData } from "../components/InfoPanel";
import HomeButton from "../components/HomeButton";
import { cesiumConstructorOptions } from "../config";

const TestMeshElevations: React.FC = () => {
  const [showNivPPoints, setShowNivPPoints] = useState(true);
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn");
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [enableTerrainClick, setEnableTerrainClick] = useState(true);
  const [searchRadius, setSearchRadius] = useState(10);
  const [enableMeasurement, setEnableMeasurement] = useState(false);
  const [infoData, setInfoData] = useState<InfoData | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const { viewer, zoomToTileset } = useTestMeshViewer(containerRef, {
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
      restoreOptions: { animate: false, duration: 0 },
    },
  });

  const handleShowInfo = useCallback((data: InfoData) => {
    setInfoData(data);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setInfoData(null);
  }, []);

  const { entities: nivPEntities, pointCount } = useNivPPoints(
    showNivPPoints ? viewer : null,
    elevationStandard,
    FESTPUNKTE_WUPPERTAL,
    includeHistoric
  );

  useSceneClick(
    viewer,
    enableTerrainClick && !enableMeasurement,
    nivPEntities,
    searchRadius,
    handleShowInfo
  );

  const { clearMeasurements, measurementCount } = useMeasurement(
    viewer,
    enableMeasurement
  );

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />

      <div style={{ position: "relative", width: "100%", height: "100vh" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        <HomeButton onHomeClick={zoomToTileset} />
      </div>

      <PointControls
        showNivPPoints={showNivPPoints}
        onShowNivPPointsChange={setShowNivPPoints}
        elevationStandard={elevationStandard}
        onElevationStandardChange={(v) => {
          setElevationStandard(v);
          cesiumSafeRequestRender(viewer);
        }}
        includeHistoric={includeHistoric}
        onIncludeHistoricChange={setIncludeHistoric}
        enableTerrainClick={enableTerrainClick}
        onEnableTerrainClickChange={setEnableTerrainClick}
        searchRadius={searchRadius}
        onSearchRadiusChange={setSearchRadius}
        pointCount={pointCount}
        enableMeasurement={enableMeasurement}
        onEnableMeasurementChange={(enabled) => {
          setEnableMeasurement(enabled);
          if (enabled && enableTerrainClick) {
            setEnableTerrainClick(false);
          }
        }}
        onClearMeasurements={clearMeasurements}
        measurementCount={measurementCount}
      />

      <InfoPanel data={infoData} onClose={handleCloseInfo} />
    </>
  );
};

export default TestMeshElevations;
