import { useEffect, useRef, useState } from "react";
import { Cesium3DTilesInspector, Viewer } from "cesium";
import { Slider, Divider } from 'antd';

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import UiBottom from "../components/UiBottom";
import UiTopRight from "../components/UiTopRight";
import { cesiumConstructorOptions } from "../config";

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

const TestMesh: React.FC = () => {
  const [maximumScreenSpaceError, setMaximumScreenSpaceError] =
    useState<number>(initialMaxError);
  const [showTileInspector, setTileInspectorVisible] = useState(false);
  const [tilesetUrl, setTilesetUrl] = useState<string>(WUPP_MESH_2024.url);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const uiTopRightRef = useRef<HTMLDivElement | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(tilesetUrl, viewerRef, {
    skipLevelOfDetail: true,
    immediatelyLoadDesiredLevelOfDetail: true,
    maximumScreenSpaceError: maximumScreenSpaceError,
    show: true,
  });

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
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

  const handleMeshQualityChange = (value: number) => {
    if (value && value !== maximumScreenSpaceError) {
      setMaximumScreenSpaceError(value);
    }
  };

  const addTileInspector = () => {
    if (!showTileInspector && viewerRef.current) {
      new Cesium3DTilesInspector(
        uiTopRightRef.current,
        viewerRef.current.scene
      );
      setTileInspectorVisible(true);
    }
  };

  useEffect(() => {
    if (uiTopRightRef.current) {
      if (showTileInspector) {
        uiTopRightRef.current.style.display = "block";
      } else {
        uiTopRightRef.current.style.display = "none";
      }
    }
  }, [showTileInspector]);

  useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);
  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <UiTopRight ref={uiTopRightRef} />
      <UiBottom>
        <div
          style={{ display: "flex", alignItems: "center", marginTop: "10px" }}
        >
          <Slider
            min={0.5}
            max={MAX_MAX_ERROR}
            step={0.5}
            onChange={handleMeshQualityChange}
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
          <Divider type="vertical" /> <button onClick={addTileInspector}>Add Tile Inspector</button>
        </div>
      </UiBottom>
    </>
  );
};

export default TestMesh;
