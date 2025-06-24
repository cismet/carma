import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

import { CesiumTerrainProvider, Color, Terrain, TerrainProvider } from "cesium";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import {
  CustomViewer,
  Compass,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/cesium-engine";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { updateHashHistoryState } from "@carma-commons/utils";

import "cesium/Build/Cesium/Widgets/widgets.css";

const TERRAIN_HQ500_CM = "https://cesium-wupp-terrain.cismet.de/HQ500cm/";
const TERRAIN_HQ500 = "https://cesium-wupp-terrain.cismet.de/HQ500/";

export const HQ500 = () => {
  const location = useLocation();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const { viewerRef, viewerAnimationMapRef, tilesetsRefs, imageryLayerRef } =
    useCesiumContext();
  const viewer = viewerRef.current;
  const primaryTileset = tilesetsRefs.primaryRef.current;
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(viewerRef, viewerAnimationMapRef);

  useTweakpaneCtx({
    folder: {
      title: "map",
    },
    params: {
      get renderCount() {
        return rerenderCountRef.current;
      },
      get renderInterval() {
        return lastRenderIntervalRef.current;
      },
      dpr: window.devicePixelRatio,
      resolutionScale: viewer ? viewer.resolutionScale : 0,
    },
    inputs: [
      { name: "renderCount", readonly: true, format: (v) => v.toFixed(0) },
      {
        name: "renderInterval",
        readonly: true,
        format: (v) => v.toFixed(0),
      },
      { name: "dpr", readonly: true, format: (v) => v.toFixed(1) },
      {
        name: "resolutionScale",
        readonly: true,
        format: (v) => v.toFixed(1),
      },
    ],
  });

  console.debug("RENDER: [DEMOAPP] MAP");
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  const provider = CesiumTerrainProvider.fromUrl(TERRAIN_HQ500_CM);
  const hq500Terrain = useMemo(() => new Terrain(provider), [provider]);

  useEffect(() => {
    if (viewer && hq500Terrain && primaryTileset) {
      const onTerrainReady = (terrainProvider: TerrainProvider) => {
        primaryTileset.show = true;
        viewer.scene.setTerrain(hq500Terrain);
        viewer.scene.backgroundColor = Color.DIMGREY;
        viewer.scene.globe.baseColor = new Color(0.3, 0.2, 0.8, 0.7);
        viewer.scene.globe.show = true;
        viewer.scene.globe.translucency.enabled = true;
        viewer.scene.globe.translucency.frontFaceAlpha = 1.0;
        viewer.scene.globe.translucency.backFaceAlpha = 1.0;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection =
          false;
        viewer.scene.terrainProvider = hq500Terrain.provider;
        console.debug(
          "ccc [CESIUM] terrain ready",
          viewer.imageryLayers.length
        );
        viewer.scene.requestRender();
      };
      hq500Terrain.readyEvent.addEventListener(onTerrainReady);

      return () => {
        hq500Terrain.readyEvent.removeEventListener(onTerrainReady);
      };
    }
  }, [viewer, hq500Terrain, primaryTileset, imageryLayerRef]);

  return (
    <ControlLayout ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div className="flex flex-col">
          <ControlButtonStyler
            onClick={handleZoomInCesium}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={handleZoomOutCesium}
            className="!rounded-t-none !border-t-[1px]"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </div>
      </Control>

      <Control position="topleft" order={40}>
        <ControlButtonStyler
          onClick={() => {
            homeControl();
          }}
        >
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
      </Control>
      <ControlLayoutCanvas ref={wrapperRef}>
        <div
          ref={container3dMapRef}
          className={"map-container-3d"}
          style={{
            height: "100vh",
          }}
        >
          <CustomViewer
            containerRef={container3dMapRef}
            cameraLimiterOptions={{
              pitchLimiter: false,
            }}
            globeOptions={{
              showGroundAtmosphere: false,
              showSkirts: true,
              baseColor: Color.RED,
            }}
            onSceneChange={(e) => {
              console.debug(
                "[GEOPORTALMAP|HASH|SCENE|CESIUM]cesium scene changed",
                e
              );
              updateHashHistoryState(e.hashParams, location.pathname, {
                removeKeys: ["zoom"],
                label: "app/hq500:3D",
              });
            }}
          ></CustomViewer>
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default HQ500;
