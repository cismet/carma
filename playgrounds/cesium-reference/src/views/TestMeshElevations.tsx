import { useRef, useState, useCallback } from "react";
import type { Cartesian3 } from "cesium";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import useNivPData, { type ElevationStandard } from "../hooks/useNivPData";
import useNivPEntities from "../hooks/useNivPEntities";
import useScenePick, { use3DCrossMarker } from "../hooks/useSceneClick";
import PointControls from "../components/PointControls";
import InfoPanel, { type InfoData } from "../components/InfoPanel";
import HomeButton from "../components/HomeButton";
import InteractiveModeTabs from "../components/InteractiveModeTabs";
import { cesiumConstructorOptions } from "../config";
import {
  CesiumMeasurementsProvider,
  useCesiumMeasurements,
} from "../contexts/CesiumMeasurementsContext";
import { CesiumViewerProvider } from "../contexts/CesiumViewerContext";
import ScreenLayout from "../components/ScreenLayout";

type InnerMeshElevationsProps = {
  showNivPPoints: boolean;
  setShowNivPPoints: (v: boolean) => void;
  elevationStandard: ElevationStandard;
  setElevationStandard: (v: ElevationStandard) => void;
  includeHistoric: boolean;
  setIncludeHistoric: (v: boolean) => void;
  enableTerrainClick: boolean;
  setEnableTerrainClick: (v: boolean) => void;
  searchRadius: number;
  setSearchRadius: (v: number) => void;
  infoData: InfoData | null;
  setInfoData: (d: InfoData | null) => void;
  handleShowInfo: (d: InfoData) => void;
  handleCloseInfo: () => void;
};

const InnerMeshElevations: React.FC<InnerMeshElevationsProps> = ({
  showNivPPoints,
  setShowNivPPoints,
  elevationStandard,
  setElevationStandard,
  includeHistoric,
  setIncludeHistoric,
  enableTerrainClick,
  setEnableTerrainClick,
  searchRadius,
  setSearchRadius,
  infoData,
  handleShowInfo,
  handleCloseInfo,
}) => {
  // Always load data, but only create entities when showNivPPoints is true
  const { filteredPoints, pointCount } = useNivPData(
    FESTPUNKTE_WUPPERTAL,
    includeHistoric
  );

  // Only create entities when showNivPPoints is enabled
  const pointsToShow = showNivPPoints ? filteredPoints : [];
  useNivPEntities(pointsToShow, elevationStandard);
  const TopRightPanel: React.FC = () => {
    const {
      enableMeasurement,
      setEnableMeasurement,
      clearMeasurements,
      hasAnyMeasurementEntities,
      measurementCount,
    } = useCesiumMeasurements();
    return (
      <>
        <InteractiveModeTabs
          enableMeasurement={enableMeasurement}
          setEnableMeasurement={setEnableMeasurement}
          enableTerrainClick={enableTerrainClick}
          onEnableTerrainClickChange={setEnableTerrainClick}
          searchRadius={searchRadius}
          onSearchRadiusChange={setSearchRadius}
          clearMeasurements={clearMeasurements}
          hasAnyMeasurementEntities={hasAnyMeasurementEntities}
          measurementCount={measurementCount}
        />
        <InfoPanel data={infoData} onClose={handleCloseInfo} />
      </>
    );
  };
  const TopLeftPanel: React.FC = () => {
    const handleElevationStandardChange = useCallback((v: ElevationStandard) => {
      setElevationStandard(v);
    }, []);

    const handleIncludeHistoricChange = useCallback((v: boolean) => {
      setIncludeHistoric(v);
    }, []);

    const handleShowNivPPointsChange = useCallback((v: boolean) => {
      setShowNivPPoints(v);
    }, []);

    return (
      <PointControls
        showNivPPoints={showNivPPoints}
        onShowNivPPointsChange={handleShowNivPPointsChange}
        elevationStandard={elevationStandard}
        onElevationStandardChange={handleElevationStandardChange}
        includeHistoric={includeHistoric}
        onIncludeHistoricChange={handleIncludeHistoricChange}
        pointCount={pointCount}
      />
    );
  };
  const ContextAwareSceneClickHandler: React.FC = () => {
    const { enableMeasurement } = useCesiumMeasurements();
    const [pickedPoint, setPickedPoint] = useState<{ cartesian: Cartesian3; info: InfoData } | null>(null);
    
    useScenePick(
      enableTerrainClick && !enableMeasurement,
      searchRadius,
      (picked) => {
        setPickedPoint(picked);
        handleShowInfo(picked.info);
      }
    );
    
    use3DCrossMarker(pickedPoint, searchRadius);
    
    return null;
  };
  return (
    <>
      <ScreenLayout
        topLeft={<TopLeftPanel />}
        topRight={<TopRightPanel />}
        bottomCenter={<HomeButton />}
      />
      <ContextAwareSceneClickHandler />
    </>
  );
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
  const handleShowInfo = useCallback((data: InfoData) => {
    setInfoData(data);
  }, []);
  const handleCloseInfo = useCallback(() => {
    setInfoData(null);
  }, []);
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
            showNivPPoints={showNivPPoints}
            setShowNivPPoints={setShowNivPPoints}
            elevationStandard={elevationStandard}
            setElevationStandard={setElevationStandard}
            includeHistoric={includeHistoric}
            setIncludeHistoric={setIncludeHistoric}
            enableTerrainClick={enableTerrainClick}
            setEnableTerrainClick={setEnableTerrainClick}
            searchRadius={searchRadius}
            setSearchRadius={setSearchRadius}
            infoData={infoData}
            setInfoData={setInfoData}
            handleShowInfo={handleShowInfo}
            handleCloseInfo={handleCloseInfo}
          />
        </CesiumMeasurementsProvider>
      </CesiumViewerProvider>
    </>
  );
};

export default TestMeshElevations;
