import { useEffect, useMemo, useRef } from "react";

import { CesiumTerrainProvider, Color, Terrain } from "cesium";

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
  isValidCesiumTerrainProvider,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium";
import { useHashState } from "@carma-providers/hash-state";

import "cesium/Build/Cesium/Widgets/widgets.css";

const TERRAIN_HQ500_CM = "https://cesium-wupp-terrain.cismet.de/HQ500cm/";

export const HQ500 = () => {
  const { updateHash } = useHashState();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const ctx = useCesiumContext();
  const { viewerRef, withScene } = ctx;
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx);

  console.debug("RENDER: [DEMOAPP] MAP");
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  const provider = CesiumTerrainProvider.fromUrl(TERRAIN_HQ500_CM);
  const hq500Terrain = useMemo(() => new Terrain(provider), [provider]);

  useEffect(() => {
    if (hq500Terrain) {
      const onTerrainReady = () => {
        ctx.withPrimaryTileset((primaryTileset) => {
          primaryTileset.show = true;
        });
        withScene((scene) => {
          scene.setTerrain(hq500Terrain);
          scene.backgroundColor = Color.DIMGREY;
          scene.globe.baseColor = new Color(0.3, 0.2, 0.8, 0.7);
          scene.globe.show = true;
          scene.globe.translucency.enabled = true;
          scene.globe.translucency.frontFaceAlpha = 1.0;
          scene.globe.translucency.backFaceAlpha = 1.0;
          scene.screenSpaceCameraController.enableCollisionDetection = false;
          scene.terrainProvider = hq500Terrain.provider;
          console.debug("ccc [CESIUM] terrain ready");
        });
        ctx.requestRender();
      };
      hq500Terrain.readyEvent.addEventListener(onTerrainReady);

      return () => {
        isValidCesiumTerrainProvider(hq500Terrain.provider) &&
          hq500Terrain.readyEvent.removeEventListener(onTerrainReady);
      };
    }
  }, [withScene, hq500Terrain, ctx]);

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
              updateHash(e.hashParams, {
                clearKeys: ["zoom"],
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
