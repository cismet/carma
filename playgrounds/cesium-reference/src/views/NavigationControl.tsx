import { FC, useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";

import {
  CesiumTerrainProvider,
  ImageryLayer,
  Viewer,
  WebMapServiceImageryProvider,
} from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";

import {
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import {
  initSceneAnimationMap,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";

import {
  getIsViewerReadyAsync,
  useZoomControls,
  PitchingCompass,
  type CesiumContextType,
} from "@carma-mapping/engines/cesium/legacy";

import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import { cesiumConstructorOptions } from "../config";
const NavigationControlView: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const ctx = {
    viewerRef,
    sceneAnimationMapRef,
  } as unknown as CesiumContextType;

  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_LOD2_TILESET.url,
    viewerRef.current
  );

  useEffect(() => {
    const initializeViewer = async () => {
      if (containerRef.current) {
        const viewer = new Viewer(
          containerRef.current,
          cesiumConstructorOptions
        );
        viewerRef.current = viewer;
        sceneAnimationMapRef.current = initSceneAnimationMap();

        viewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
          WUPP_TERRAIN_PROVIDER.url
        );

        const imageryProvider = new WebMapServiceImageryProvider(
          BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU
        );
        const newImageryLayer = new ImageryLayer(imageryProvider);
        viewer.imageryLayers.add(newImageryLayer);

        await getIsViewerReadyAsync(viewer, setIsViewerReady);
      }
    };

    initializeViewer();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        sceneAnimationMapRef.current = null;
      }
    };
  }, []);

  useZoomToTilesetOnReady(viewerRef.current, tilesetRef, tilesetReady);
  const { handleZoomIn, handleZoomOut } = useZoomControls(ctx);

  console.log("RENDER", isViewerReady);

  return (
    <>
      {isViewerReady && (
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
              <ControlButtonStyler
                onClick={handleZoomIn}
                style={{
                  borderBottomWidth: 0,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  fontWeight: 700,
                  zIndex: 9999999,
                }}
                dataTestId="zoom-in-control"
              >
                <FontAwesomeIcon icon={faPlus} style={{ fontSize: "1rem" }} />
              </ControlButtonStyler>
            </Tooltip>
            <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
              <ControlButtonStyler
                onClick={handleZoomOut}
                style={{
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderTopWidth: 1,
                  borderTopStyle: "solid",
                }}
                dataTestId="zoom-out-control"
              >
                <FontAwesomeIcon icon={faMinus} style={{ fontSize: "1rem" }} />
              </ControlButtonStyler>
            </Tooltip>
          </Control>
          <Control position="topleft" order={30}>
            <ControlButtonStyler>
              <PitchingCompass />
            </ControlButtonStyler>
          </Control>
        </ControlLayout>
      )}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
        }}
      />
    </>
  );
};

export default NavigationControlView;
