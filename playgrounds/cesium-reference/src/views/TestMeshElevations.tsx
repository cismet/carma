import { useEffect, useMemo, useRef, useState } from "react";

import { Cesium3DTilesInspector, Viewer, CesiumWidget } from "cesium";
import { Slider, Divider } from "antd";

import { FESTPUNKTE_WUPPERTAL, WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import useNivPPoints, { type ElevationStandard } from "../hooks/useNivPPoints";
import useTerrainClick from "../hooks/useTerrainClick";
import useCameraElevation from "../hooks/useCameraElevation";
import UiBottom from "../components/UiBottom";
import UiTopRight from "../components/UiTopRight";
import PointControls from "../components/PointControls";
import { cesiumConstructorOptions } from "../config";
import { vi } from "vitest";

const DEFAULT_MAX_ERROR = 5;
const MAX_MAX_ERROR = 32;
const initialMaxError = (() => {
  const hash = window.location.hash;
  const queryStringIndex = hash.indexOf("?");
  if (queryStringIndex !== -1) {
    const queryString = hash.substring(queryStringIndex + 1);
    const hashParams = new URLSearchParams(queryString);
    const maxErrorParam = parseFloat(
      hashParams.get("maxerror") || DEFAULT_MAX_ERROR.toString()
    );
    return maxErrorParam >= 0.5 && maxErrorParam <= MAX_MAX_ERROR
      ? maxErrorParam
      : DEFAULT_MAX_ERROR;
  }
  return DEFAULT_MAX_ERROR;
})();
console.log("ini", initialMaxError);

const TestMeshElevations: React.FC = () => {
  const [maximumScreenSpaceError, setMaximumScreenSpaceError] =
    useState<number>(initialMaxError);
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
    useMemo(
      () => ({
        skipLevelOfDetail: true,
        immediatelyLoadDesiredLevelOfDetail: true,
        maximumScreenSpaceError: maximumScreenSpaceError,
        show: true,
      }),
      [maximumScreenSpaceError] // Fix missing dependency
    )
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
  useTerrainClick(viewerRef.current, enableTerrainClick, !hideLabels);

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
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
        console.log("Destroying viewer");
        viewerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = maximumScreenSpaceError;
      console.info(
        "maximumScreenSpaceError",
        tilesetRef.current.maximumScreenSpaceError
      );
    }
  }, [maximumScreenSpaceError, tilesetRef]);

  useEffect(() => {
    const hash = window.location.hash.split("?")[0];
    const hashParams = new URLSearchParams(
      window.location.hash.slice(hash.length)
    );
    hashParams.set("maxerror", maximumScreenSpaceError.toString());
    window.location.hash = `${hash}?${hashParams.toString()}`;
  }, [maximumScreenSpaceError]);

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

      <UiBottom>
        {/* Tileset Controls */}
        <div
          style={{ display: "flex", alignItems: "center", marginTop: "10px" }}
        >
          <Slider
            min={0}
            max={MAX_MAX_ERROR}
            step={0.1}
            onChange={setMaximumScreenSpaceError}
            value={maximumScreenSpaceError}
            tooltip={{ formatter: (value) => `Mesh maxError: ${value}` }}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => setMaximumScreenSpaceError(0.5)}>
            Error to 0.5
          </button>
          <button onClick={() => setMaximumScreenSpaceError(1)}>
            Error to 1
          </button>
          <button onClick={() => setMaximumScreenSpaceError(2)}>
            Error to 2
          </button>
          <button onClick={() => setMaximumScreenSpaceError(5)}>
            Error to 5
          </button>
          <button onClick={() => setMaximumScreenSpaceError(32)}>
            Error to 32
          </button>
          <button
            onClick={() => {
              try {
                throw new Error("Forced render error");
              } catch (error) {
                CesiumWidget.prototype.showErrorPanel(
                  "Render Error",
                  "This is a forced render error for testing purposes.",
                  error
                );
              }
            }}
          >
            Force Render Error
          </button>
          <Divider type="vertical" />
          <button onClick={() => setShowTileInspector(true)}>
            Add Tile Inspector
          </button>
        </div>
      </UiBottom>
    </>
  );
};

export default TestMeshElevations;
