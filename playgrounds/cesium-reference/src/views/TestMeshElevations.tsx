import { useRef, useState, useCallback } from "react";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  CesiumErrorToErrorBoundaryForwarder,
  cesiumSafeRequestRender,
} from "@carma-mapping/cesium-engine";

import { useTestMeshViewer } from "../hooks/usePersistentViewer";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import useSceneClick from "../hooks/useSceneClick";
import PointControls from "../components/PointControls";
import InfoPanel, { type InfoData } from "../components/InfoPanel";
import HomeButton from "../components/HomeButton";
import { cesiumConstructorOptions } from "../config";
import {
  CesiumMeasurementsProvider,
  useCesiumMeasurements,
} from "../contexts/CesiumMeasurementsContext";

interface SceneClickHandlerProps {
  viewer: ReturnType<typeof useTestMeshViewer>["viewer"];
  enableTerrainClick: boolean;
  nivPEntities: ReturnType<typeof useNivPPoints>["entities"];
  searchRadius: number;
  handleShowInfo: (data: InfoData) => void;
}

/* eslint-disable react/prop-types */ // Disable prop-types linting for this helper component
const SceneClickHandler: React.FC<SceneClickHandlerProps> = ({
  viewer,
  enableTerrainClick,
  nivPEntities,
  searchRadius,
  handleShowInfo,
}) => {
  const { enableMeasurement } = useCesiumMeasurements();
  useSceneClick(
    viewer,
    enableTerrainClick && !enableMeasurement,
    nivPEntities,
    searchRadius,
    handleShowInfo
  );
  return null;
};

const TestMeshElevations: React.FC = () => {
  const [showNivPPoints, setShowNivPPoints] = useState(true);
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn");
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [enableTerrainClick, setEnableTerrainClick] = useState(true);
  const [searchRadius, setSearchRadius] = useState(10);
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

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
      <CesiumMeasurementsProvider viewer={viewer}>
        <div style={{ position: "relative", width: "100%", height: "100vh" }}>
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
          <HomeButton onHomeClick={zoomToTileset} />
          <SceneClickHandler
            viewer={viewer}
            enableTerrainClick={enableTerrainClick}
            nivPEntities={nivPEntities}
            searchRadius={searchRadius}
            handleShowInfo={handleShowInfo}
          />
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
        />

        <InfoPanel data={infoData} onClose={handleCloseInfo} />
      </CesiumMeasurementsProvider>
    </>
  );
};

export default TestMeshElevations;
