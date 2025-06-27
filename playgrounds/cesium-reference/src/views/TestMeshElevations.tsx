import { useRef, useState, useCallback } from "react";
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
} from "../contexts/CesiumMeasurementsContext";
import useSceneClick from "../hooks/useSceneClick";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import InfoPanel from "../components/InfoPanel";
import PointQueryInfo, {
  type PointQueryData,
} from "../components/PointQueryInfo";
import InteractiveModeTabs from "../components/InteractiveModeTabs";
import ScreenLayout from "../components/ScreenLayout";
import { cesiumConstructorOptions } from "../config";

// Inner component that has access to contexts
const InnerMeshElevations: React.FC<{
  showNivPPoints: boolean;
  elevationStandard: ElevationStandard;
  includeHistoric: boolean;
  enableTerrainClick: boolean;
  setEnableTerrainClick: (value: boolean) => void;
  searchRadius: number;
  setSearchRadius: (value: number) => void;
}> = ({
  showNivPPoints,
  elevationStandard,
  includeHistoric,
  enableTerrainClick,
  setEnableTerrainClick,
  searchRadius,
  setSearchRadius,
}) => {
  const { viewerRef, zoomToTileset } = useCesiumViewer();
  const {
    enableMeasurement,
    setEnableMeasurement,
    clearMeasurements,
    hasAnyMeasurementEntities,
    measurementCount,
  } = useCesiumMeasurements();

  const { entities: nivPEntities } = useNivPPoints(
    showNivPPoints ? viewerRef.current : null,
    elevationStandard,
    FESTPUNKTE_WUPPERTAL,
    includeHistoric
  );

  const [infoData, setInfoData] = useState<PointQueryData | null>(null);

  const handleShowInfo = useCallback((data: PointQueryData) => {
    setInfoData(data);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setInfoData(null);
  }, []);

  useSceneClick(
    viewerRef.current,
    enableTerrainClick && !enableMeasurement,
    nivPEntities,
    searchRadius,
    handleShowInfo
  );

  const TopRightPanel: React.FC = () => {
    return (
      <Flex vertical gap={2}>
        <InteractiveModeTabs
          enableTerrainClick={enableTerrainClick}
          setEnableTerrainClick={setEnableTerrainClick}
          enableMeasurement={enableMeasurement}
          setEnableMeasurement={setEnableMeasurement}
          searchRadius={searchRadius}
          onSearchRadiusChange={setSearchRadius}
          clearMeasurements={clearMeasurements}
          hasAnyMeasurementEntities={hasAnyMeasurementEntities}
          measurementCount={measurementCount}
        />
        <InfoPanel onClose={infoData ? handleCloseInfo : undefined}>
          {infoData ? (
            <PointQueryInfo data={infoData} />
          ) : (
            "Im Viewer für eine neue Abfrage auf die Karte klicken."
          )}
        </InfoPanel>
      </Flex>
    );
  };

  return (
    <>
      <ScreenLayout topRight={<TopRightPanel />} />
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
            showNivPPoints={showNivPPoints}
            elevationStandard={elevationStandard}
            includeHistoric={includeHistoric}
            enableTerrainClick={enableTerrainClick}
            setEnableTerrainClick={setEnableTerrainClick}
            searchRadius={searchRadius}
            setSearchRadius={setSearchRadius}
          />
        </CesiumMeasurementsProvider>
      </CesiumViewerProvider>
    </>
  );
};

export default TestMeshElevations;
