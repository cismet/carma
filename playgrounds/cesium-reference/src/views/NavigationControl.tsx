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
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import {
  getIsViewerReadyAsync,
  useZoomControls,
  PitchingCompass,
  initViewerAnimationMap,
  type ViewerAnimationMap,
} from "@carma-mapping/cesium-engine";

import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import { cesiumConstructorOptions } from "../config";
const NavigationControlView: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const viewerAnimationMapRef = useRef<ViewerAnimationMap | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);

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
        viewerAnimationMapRef.current = initViewerAnimationMap();

        viewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
          WUPP_TERRAIN_PROVIDER.url
        );

        const imageryProvider = new WebMapServiceImageryProvider(
          BASEMAP_METROPOLRUHR_WMS_GRAUBLAU
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
        viewerAnimationMapRef.current = null;
      }
    };
  }, []);

  useZoomToTilesetOnReady(viewerRef.current, tilesetRef, tilesetReady);
  const { handleZoomIn, handleZoomOut } = useZoomControls(
    viewerRef,
    viewerAnimationMapRef
  );

  console.log("RENDER", isViewerReady);

  return (
    <>
      {isViewerReady && (
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
              <ControlButtonStyler
                onClick={handleZoomIn}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
            </Tooltip>
            <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
              <ControlButtonStyler
                onClick={handleZoomOut}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
            </Tooltip>
          </Control>
          <Control position="topleft" order={30}>
            <ControlButtonStyler>
              <PitchingCompass
                viewerRef={viewerRef}
                viewerAnimationMapRef={viewerAnimationMapRef}
                isViewerReady={isViewerReady}
              />
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
