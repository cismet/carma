import { useContext, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import {
  Cartographic,
  Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import { isNumberArrayEqual } from "@carma-commons/utils";

import {
  // TODO: Refactor removed - isValidCesiumTerrainProvider not exported
  // isValidCesiumTerrainProvider,
  useCesiumContext,
  // TODO: Refactor removed - guardSampleTerrainMostDetailedAsync not exported
  // guardSampleTerrainMostDetailedAsync,
} from "@carma-mapping/engines/cesium/core";
// TODO: Waiting for new API - selectViewerIsMode2d moved or removed
// import { selectViewerIsMode2d } from "@carma-mapping/engines/cesium/core";

import { useHGKCesiumTerrain } from "../hooks/useHGKCesiumTerrain";
import { onCesiumClick } from "../utils/cesiumHandlers";
// TODO: Waiting for new API - geo utils need to be reimplemented
// import { getWebMercatorInWGS84 } from "../utils/geo";
import { updateMarkerPosition } from "../utils/marker";

import config from "../config";
import {
  AERIAL_BACKGROUND_INDEX,
  HGK_KEYS,
  HGK_TERRAIN_PROVIDER_URLS,
} from "../config/app.config";
import NotesDisplay from "./NotesDisplay";

export const StateAwareChildren = () => {
  // ENVIROMETRICMAP
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  // TODO: Waiting for new API - Redux can be removed
  const isMode2d = false; // useSelector(selectViewerIsMode2d);

  const { executeFeatureInfoRequest, setBackgroundIndex } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);

  const isHWS = controlState.customInfoBoxToggleState;

  const conf = config.config;

  // CESIUM
  // TODO: Waiting for new API - terrainProviderRef not in context anymore
  const { sceneRef } = useCesiumContext();
  const terrainProviderRef = { current: null };
  const [cesiumPickedPosition, setCesiumPickedPosition] = useState<
    [number, number] | null
  >(null);
  // TODO: Use Primitive type instead of Entity for markers
  const markerEntityRef = useRef<Entity | null>(null);
  const highlightEntityRef = useRef<Entity | null>(null);
  const prevPositionRef = useRef<[number, number] | null>(null);
  const selectedBackground2dRef = useRef<number>(
    controlState.selectedBackground
  );

  useEffect(() => {
    // TODO: Waiting for new API - geo utils need to be reimplemented
    // update 3d marker position from 2d while in 2d
    // if (
    //   controlState.featureInfoModeActivated &&
    //   controlState.currentFeatureInfoPosition
    // ) {
    //   const asyncUpdate = async () => {
    //     const { lat, lon } = getWebMercatorInWGS84(
    //       controlState.currentFeatureInfoPosition
    //     );
    //     const cartographic = Cartographic.fromDegrees(lon, lat);
    //     if (!isValidCesiumTerrainProvider(terrainProviderRef.current)) return;
    //     const [groundPositionCartographic] =
    //       await guardSampleTerrainMostDetailedAsync(
    //         terrainProviderRef.current,
    //         [cartographic]
    //       );
    //     if (!groundPositionCartographic) return;
    //     updateMarkerPosition(
    //       markerEntityRef,
    //       highlightEntityRef,
    //       groundPositionCartographic
    //     );
    //   };
    //   asyncUpdate();
    // }
  }, [
    terrainProviderRef,
    controlState.featureInfoModeActivated,
    controlState.currentFeatureInfoPosition,
  ]);

  useEffect(() => {
    // force background to aerial in 2d
    if (isMode2d) {
      setBackgroundIndex(selectedBackground2dRef.current);
    } else {
      // store 2d background layer style before forcing to aerial
      selectedBackground2dRef.current = controlState.selectedBackground;
      setBackgroundIndex(AERIAL_BACKGROUND_INDEX);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMode2d]); // intentionally only trigger on mode change

  // TODO: Waiting for new API - use scene.primitives instead of entities
  // Markers should be implemented as primitives on the scene, not entities
  // useEffect(() => {
  //   const scene = sceneRef.current;
  //   if (!isValidScene(scene)) return;
  //   if (controlState.featureInfoModeActivated) {
  //     const handler = new ScreenSpaceEventHandler(scene.canvas);
  //     handler.setInputAction(
  //       async (click) =>
  //         onCesiumClick(
  //           click,
  //           scene,
  //           terrainProviderRef,
  //           markerPrimitiveRef,
  //           highlightPrimitiveRef,
  //           setCesiumPickedPosition
  //         ),
  //       ScreenSpaceEventType.LEFT_CLICK
  //     );

  //     return () => {
  //       handler.destroy();
  //       setCesiumPickedPosition(null);

  //       if (scene.isDestroyed()) return;

  //       if (markerPrimitiveRef.current) {
  //         scene.primitives.remove(markerPrimitiveRef.current);
  //         markerPrimitiveRef.current = null;
  //       }
  //       if (highlightPrimitiveRef.current) {
  //         scene.primitives.remove(highlightPrimitiveRef.current);
  //         highlightPrimitiveRef.current = null;
  //       }
  //       scene.requestRender();
  //     };
  //   }
  // }, [sceneRef, controlState.featureInfoModeActivated]);

  // TODO: Waiting for new API - use scene.primitives instead of entities
  // Cleanup primitives when feature info mode is disabled
  // useEffect(() => {
  //   const scene = sceneRef.current;
  //   if (!isValidScene(scene)) return;
  //   if (!controlState.featureInfoModeActivated && sceneRef.current) {
  //     if (sceneRef.current.isDestroyed()) return;

  //     if (markerPrimitiveRef.current) {
  //       sceneRef.current.primitives.remove(markerPrimitiveRef.current);
  //       markerPrimitiveRef.current = null;
  //     }
  //     if (highlightPrimitiveRef.current) {
  //       sceneRef.current.primitives.remove(highlightPrimitiveRef.current);
  //       highlightPrimitiveRef.current = null;
  //     }
  //     setCesiumPickedPosition(null);
  //   }
  // }, [sceneRef, controlState.featureInfoModeActivated]);

  useEffect(() => {
    if (
      controlState.featureInfoModeActivated &&
      cesiumPickedPosition &&
      (!prevPositionRef.current ||
        !isNumberArrayEqual(prevPositionRef.current, cesiumPickedPosition))
    ) {
      /*
      console.debug(
        "cesium picked position changed",
        controlState,
        cesiumPickedPosition,
        executeFeatureInfoRequest
      );
      */
      prevPositionRef.current = cesiumPickedPosition;

      executeFeatureInfoRequest({
        lat: cesiumPickedPosition[0],
        lng: cesiumPickedPosition[1],
      });
    }
  }, [cesiumPickedPosition, controlState.featureInfoModeActivated]);

  useHGKCesiumTerrain(
    controlState.selectedSimulation,
    isHWS,
    HGK_KEYS,
    HGK_TERRAIN_PROVIDER_URLS
  );

  //console.debug("RENDER: StateAwareChildren", controlState);

  return (
    <>
      {isHWS && controlState.selectedSimulation !== 2 && <NotesDisplay />}
      {!isHWS &&
        conf.simulations[controlState.selectedSimulation].gefaehrdungsLayer && (
          <StyledWMSTileLayer
            key={
              "rainHazardMap.depthLayer" +
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer +
              "." +
              controlState.selectedBackground
            }
            url={conf.modelWMS}
            layers={
              conf.simulations[controlState.selectedSimulation]
                .gefaehrdungsLayer
            }
            version="1.1.1"
            transparent="true"
            format="image/png"
            tiled={true}
            styles={
              conf.simulations[controlState.selectedSimulation].depthStyle
            }
            maxZoom={22}
            opacity={0.8}
          />
        )}
    </>
  );
};
