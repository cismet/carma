import { FC, useEffect, useRef } from "react";
import {
  CesiumTerrainProvider,
  ImageryLayer,
  Viewer,
  WebMapServiceImageryProvider,
} from "cesium";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import UiTopRight from "../components/UiTopRight";
import RotateButton from "../components/RotateButton";
import WIP from "../components/WIP";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useZoomControls } from "@carma-mapping/cesium-engine";

const NavigationControlView: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_LOD2_TILESET.url,
    viewerRef
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;

          viewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
            WUPP_TERRAIN_PROVIDER.url
          );

          const imageryProvider = new WebMapServiceImageryProvider(
            BASEMAP_METROPOLRUHR_WMS_GRAUBLAU
          );
          const newImageryLayer = new ImageryLayer(imageryProvider);
          viewer.imageryLayers.add(newImageryLayer);
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

  useZoomToTilesetOnReady(viewerRef, tilesetRef, tilesetReady);
  const { handleZoomIn, handleZoomOut } = useZoomControls(viewerRef, 1);
  return (
    <>
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
            <RotateButton viewerRef={viewerRef} />
          </ControlButtonStyler>
        </Control>
      </ControlLayout>
      <div>
        <WIP message="for Review only" />
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
      </div>
    </>
  );
};

export default NavigationControlView;
