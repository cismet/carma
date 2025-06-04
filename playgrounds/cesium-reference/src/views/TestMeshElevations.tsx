import { useEffect, useMemo, useRef, useState } from "react";

import { Cesium3DTilesInspector, Viewer, CesiumWidget } from "cesium";
import { Slider, Divider } from "antd";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import useSceneClick from "../hooks/useSceneClick";
import useCameraElevation from "../hooks/useCameraElevation";
import UiTopRight from "../components/UiTopRight";
import PointControls from "../components/PointControls";
import { cesiumConstructorOptions } from "../config";

const tilesetConstructorOptions = {
  skipLevelOfDetail: true,
  immediatelyLoadDesiredLevelOfDetail: true,
  maximumScreenSpaceError: 1,
  show: true,
};

const TestMeshElevations: React.FC = () => {
  const [showTileInspector, setShowTileInspector] = useState(false);
  const [showNivPPoints, setShowNivPPoints] = useState(true); // Load points by default
  const [elevationStandard, setElevationStandard] =
    useState<ElevationStandard>("nhn"); // Default to NHN
  const [includeHistoric, setIncludeHistoric] = useState(false); // Filter out historic points by default
  const [enableTerrainClick, setEnableTerrainClick] = useState(true); // Enable terrain clicking by default
  const [tilesetUrl] = useState<string>(WUPP_MESH_2024.url);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const uiTopRightRef = useRef<HTMLDivElement | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    tilesetUrl,
    viewerRef,

    tilesetConstructorOptions
  );

  // Monitor camera elevation for label visibility
  const { isAboveThreshold: hideLabels } = useCameraElevation(
    viewerRef.current,
    1500
  );

  // Load NivP points when enabled
  const {
    isLoading: nivPLoading,
    error: nivPError,
    pointCount,
    elevationStandard: currentElevationStandard,
  } = useNivPPoints(
    showNivPPoints ? viewerRef.current : null,
    elevationStandard,
    FESTPUNKTE_WUPPERTAL,
    !hideLabels,
    includeHistoric
  );

  // Enable terrain clicking functionality
  useSceneClick(viewerRef.current, enableTerrainClick, !hideLabels);

  useEffect(() => {
    if (viewerRef.current) {
      console.log("Viewer is already loaded");
      return;
    }

    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(containerRef.current, {
            ...cesiumConstructorOptions,
            infoBox: true, // Enable InfoBox to show entity details when clicked
          });
          viewerRef.current = viewer;
          console.debug("[TestMeshElevations] Viewer initialized");
        }
      } catch (error) {
        console.error("[TestMeshElevations] Initialization error:", error);
      }
    };

    initialize();

    return () => {
      try {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          console.debug("[TestMeshElevations] Destroying viewer");
          viewerRef.current.destroy();
          viewerRef.current = null;
        }
      } catch (error) {
        console.error("[TestMeshElevations] Error destroying viewer:", error);
      }
    };
  }, []);

  useEffect(() => {
    if (uiTopRightRef.current) {
      uiTopRightRef.current.style.display = "none";
    }

    if (showTileInspector && viewerRef.current) {
      new Cesium3DTilesInspector(
        uiTopRightRef.current,
        viewerRef.current.scene
      );
      if (uiTopRightRef.current) {
        uiTopRightRef.current.style.display = "block";
      }
    }
  }, [showTileInspector]);

  useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <UiTopRight ref={uiTopRightRef} />

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
        pointCount={pointCount}
        nivPLoading={nivPLoading}
        nivPError={nivPError}
        currentElevationStandard={currentElevationStandard}
      />
    </>
  );
};

export default TestMeshElevations;
