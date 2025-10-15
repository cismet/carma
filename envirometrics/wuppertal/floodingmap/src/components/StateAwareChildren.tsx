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
  isValidCesiumTerrainProvider,
  selectViewerIsMode2d,
  useCesiumContext,
  guardSampleTerrainMostDetailedAsync,
} from "@carma-mapping/engines/cesium";

import { useHGKCesiumTerrain } from "../hooks/useHGKCesiumTerrain";
import { onCesiumClick } from "../utils/cesiumHandlers";
import { getWebMercatorInWGS84 } from "../utils/geo";
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
  const isMode2d = useSelector(selectViewerIsMode2d);

  const { executeFeatureInfoRequest, setBackgroundIndex } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);

  const isHWS = controlState.customInfoBoxToggleState;

  const conf = config.config;

  // CESIUM
  const { sceneRef, terrainProviderRef } = useCesiumContext();
  const [cesiumPickedPosition, setCesiumPickedPosition] = useState<
    [number, number] | null
  >(null);
  const markerEntityRef = useRef<Entity | null>(null);
  const highlightEntityRef = useRef<Entity | null>(null);
  const prevPositionRef = useRef<[number, number] | null>(null);
  const selectedBackground2dRef = useRef<number>(
    controlState.selectedBackground
  );

  useEffect(() => {
    // update 3d marker position from 2d while in 2d
    if (
      controlState.featureInfoModeActivated &&
      controlState.currentFeatureInfoPosition
    ) {
      const asyncUpdate = async () => {
        const { lat, lon } = getWebMercatorInWGS84(
          controlState.currentFeatureInfoPosition
        );

        const cartographic = Cartographic.fromDegrees(lon, lat);

        if (!isValidCesiumTerrainProvider(terrainProviderRef.current)) return;

        const [groundPositionCartographic] =
          await guardSampleTerrainMostDetailedAsync(
            terrainProviderRef.current,
            [cartographic]
          );
        if (!groundPositionCartographic) return;

        updateMarkerPosition(
          markerEntityRef,
          highlightEntityRef,
          groundPositionCartographic
        );
      };
      asyncUpdate();
    }
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

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    if (controlState.featureInfoModeActivated) {
      const handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction(
        async (click) =>
          onCesiumClick(
            click,
            scene,
            terrainProviderRef,
            markerEntityRef,
            highlightEntityRef,
            setCesiumPickedPosition
          ),
        ScreenSpaceEventType.LEFT_CLICK
      );

      return () => {
        handler.destroy();
        setCesiumPickedPosition(null);

        if (scene.isDestroyed()) return;

        if (markerEntityRef.current) {
          scene.entities.remove(markerEntityRef.current);
          markerEntityRef.current = null;
        }
        if (highlightEntityRef.current) {
          scene.entities.remove(highlightEntityRef.current);
          highlightEntityRef.current = null;
        }
        scene.requestRender();
      };
    }
  }, [sceneRef, controlState.featureInfoModeActivated]);

  // Add effect to cleanup marker when feature info mode is disabled
  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    if (!controlState.featureInfoModeActivated && sceneRef.current) {
      if (sceneRef.current.isDestroyed()) return;

      if (markerEntityRef.current) {
        sceneRef.current.entities.remove(markerEntityRef.current);
        markerEntityRef.current = null;
      }
      if (highlightEntityRef.current) {
        sceneRef.current.entities.remove(highlightEntityRef.current);
        highlightEntityRef.current = null;
      }
      setCesiumPickedPosition(null);
    }
  }, [sceneRef, controlState.featureInfoModeActivated]);

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
