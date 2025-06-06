import { useRef, useState, useCallback } from "react";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import { useTestMeshViewer } from "../hooks/usePersistentViewer";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import useSceneClick from "../hooks/useSceneClick";
import useMeasurement from "../hooks/useMeasurement";
import PointControls from "../components/PointControls";
import InfoPanel, { type InfoData } from "../components/InfoPanel";
import HomeButton from "../components/HomeButton";
import { cesiumConstructorOptions } from "../config";

const TestMeshElevations: React.FC = () => {
  const [showNivPPoints, setShowNivPPoints] = useState(true); // Load points by default
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn"); // Default to NHN
  const [includeHistoric, setIncludeHistoric] = useState(false); // Filter out historic points by default
  const [enableTerrainClick, setEnableTerrainClick] = useState(true); // Enable terrain clicking by default
  const [searchRadius, setSearchRadius] = useState(10); // Search radius in meters
  const [enableMeasurement, setEnableMeasurement] = useState(false); // Measurement mode disabled by default
  const [infoData, setInfoData] = useState<InfoData | null>(null); // Info panel data

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Comprehensive viewer setup with camera persistence and conditional zoom
  const { viewer, viewerRef, zoomToTileset } = useTestMeshViewer(containerRef, {
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

  // Callback to show info in custom panel
  const handleShowInfo = useCallback((data: InfoData) => {
    setInfoData(data);
  }, []);

  // Callback to close info panel
  const handleCloseInfo = useCallback(() => {
    setInfoData(null);
  }, []);

  // Load NivP points when enabled
  const { entities: nivPEntities, pointCount } = useNivPPoints(
    showNivPPoints ? viewer : null,
    elevationStandard,
    FESTPUNKTE_WUPPERTAL,
    includeHistoric
  );

  // Enable terrain clicking functionality with custom info panel callback
  // Pass nivPEntities to enable custom info display for nearby points
  // Disable terrain click when measurement mode is active
  useSceneClick(
    viewer,
    enableTerrainClick && !enableMeasurement,
    nivPEntities,
    searchRadius, // Use dynamic search radius
    handleShowInfo // Custom info panel callback
  );

  // Enable measurement functionality
  // Disable terrain click when measurement mode is active
  const { clearMeasurements, measurementCount } = useMeasurement(
    viewer,
    enableMeasurement
  );

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />

      {/* Map container with relative positioning for absolute children */}
      <div style={{ position: "relative", width: "100%", height: "100vh" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Home Button with integrated positioning and panel styling */}
        <HomeButton onHomeClick={zoomToTileset} />
      </div>

      {/* Point Controls in top left */}
      <PointControls
        showNivPPoints={showNivPPoints}
        onShowNivPPointsChange={setShowNivPPoints}
        elevationStandard={elevationStandard}
        onElevationStandardChange={(v) => {
          setElevationStandard(v);
          viewerRef.current?.scene.requestRender(); // Request render on elevation standard change
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
          // Auto-disable terrain click when measurement is enabled
          if (enabled && enableTerrainClick) {
            setEnableTerrainClick(false);
          }
        }}
        onClearMeasurements={clearMeasurements}
        measurementCount={measurementCount}
      />

      {/* Custom Info Panel in top right */}
      <InfoPanel data={infoData} onClose={handleCloseInfo} />
    </>
  );
};

export default TestMeshElevations;
