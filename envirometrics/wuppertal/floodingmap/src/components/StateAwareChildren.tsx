import { useContext, useEffect, useRef, useState } from "react";

import {
  Cartographic,
  PolylineCollection,
  Primitive,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "@carma-cesium";

import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import { isNumberArrayEqual } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getTerrainElevationAsync } from "@carma-mapping/engines/cesium/core";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import { useHashState } from "@carma-providers/hash-state";

import config from "../config";
import { AERIAL_BACKGROUND_INDEX, HGK_KEYS } from "../config/app.config";
import { FLOODINGMAP_TERRAIN_PROVIDER_IDS } from "../config/cesium/cesium.config";
import {
  FLOODINGMAP_HASH_KEYS,
  FLOODINGMAP_QUERY_HASH_CLEAR_KEYS,
} from "../config/hash-state.config";
import { useFloodingSceneStyleSync } from "../hooks/useFloodingSceneStyleSync";
import { onCesiumClick } from "../utils/cesiumHandlers";
import { getWebMercatorInWGS84, getWGS84InWebMercator } from "../utils/geo";
import { updateMarkerPosition } from "../utils/marker";
import NotesDisplay from "./NotesDisplay";
export const StateAwareChildren = () => {
  const floorToMeterGrid = (value: number): number => Math.floor(value);

  // ENVIROMETRICMAP
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { isLeaflet } = useMapFrameworkSwitcherContext();
  const { updateHashState } = useHashState();

  const { executeFeatureInfoRequest, setBackgroundIndex } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);

  const isHWS = controlState.customInfoBoxToggleState;

  const conf = config.config;

  // CESIUM
  const cesiumContext = useCesiumContext();
  const { isRuntimeReady, runtimeRef, getTerrainProviderById } = cesiumContext;
  // The active scene terrain is now the flood water surface; the marker /
  // feature-info elevation is sampled against the bare-ground (DGM) terrain
  // (TERRAIN_2020) instead, so the marker sits on the ground as before and the
  // water rises above it.
  const [cesiumPickedPosition, setCesiumPickedPosition] = useState<
    [number, number] | null
  >(null);
  const markerPrimitiveRef = useRef<Primitive | null>(null);
  const highlightPrimitiveRef = useRef<PolylineCollection | null>(null);
  const prevPositionRef = useRef<[number, number] | null>(null);
  const initialRestoredQueryPositionRef = useRef<[number, number] | null>(
    controlState.currentFeatureInfoPosition ?? null
  );
  const didAutoFetchRestoredQueryRef = useRef(false);
  const selectedBackground2dRef = useRef<number>(
    controlState.selectedBackground
  );

  useEffect(() => {
    if (
      !controlState.featureInfoModeActivated ||
      !controlState.currentFeatureInfoPosition
    ) {
      updateHashState(undefined, {
        label: "app/hgk:query",
        clearStateKeys: [...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS],
        replace: true,
      });
      return;
    }

    const [x, y] = controlState.currentFeatureInfoPosition;
    updateHashState(
      {
        [FLOODINGMAP_HASH_KEYS.QUERY_X]: floorToMeterGrid(x),
        [FLOODINGMAP_HASH_KEYS.QUERY_Y]: floorToMeterGrid(y),
      },
      {
        label: "app/hgk:query",
        clearStateKeys: [...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS],
        replace: true,
      }
    );
  }, [
    controlState.currentFeatureInfoPosition,
    controlState.featureInfoModeActivated,
    updateHashState,
  ]);

  useEffect(() => {
    const initialRestoredPosition = initialRestoredQueryPositionRef.current;
    if (!initialRestoredPosition || didAutoFetchRestoredQueryRef.current) {
      return;
    }

    const restoredPosition = controlState.currentFeatureInfoPosition;
    if (
      !restoredPosition ||
      !isNumberArrayEqual(restoredPosition, initialRestoredPosition)
    ) {
      return;
    }

    if (controlState.currentFeatureInfoValue !== undefined) {
      didAutoFetchRestoredQueryRef.current = true;
      return;
    }

    didAutoFetchRestoredQueryRef.current = true;

    const { lat, lon } = getWebMercatorInWGS84(restoredPosition);
    executeFeatureInfoRequest({
      lat,
      lng: lon,
    });
  }, [
    controlState.currentFeatureInfoPosition,
    controlState.currentFeatureInfoValue,
    executeFeatureInfoRequest,
  ]);

  useEffect(() => {
    // update 3d marker position from 2d while in 2d
    if (
      controlState.featureInfoModeActivated &&
      controlState.currentFeatureInfoPosition
    ) {
      const asyncUpdate = async () => {
        if (
          !isRuntimeReady ||
          !runtimeRef.current ||
          runtimeRef.current.isDestroyed()
        )
          return;
        const { lat, lon } = getWebMercatorInWGS84(
          controlState.currentFeatureInfoPosition
        );

        const cartographic = Cartographic.fromDegrees(lon, lat);

        const terrainProvider = getTerrainProviderById(
          FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020
        );
        if (!terrainProvider) return;

        const [groundPositionCartographic] = await getTerrainElevationAsync(
          terrainProvider,
          [cartographic]
        );
        if (!groundPositionCartographic) return;

        updateMarkerPosition(
          runtimeRef.current!,
          markerPrimitiveRef,
          highlightPrimitiveRef,
          groundPositionCartographic
        );
      };
      asyncUpdate();
    }
  }, [
    isRuntimeReady,
    getTerrainProviderById,
    runtimeRef,
    cesiumContext,
    controlState.featureInfoModeActivated,
    controlState.currentFeatureInfoPosition,
    isLeaflet,
  ]);

  useEffect(() => {
    // force background to aerial in 2d
    if (isLeaflet) {
      setBackgroundIndex(selectedBackground2dRef.current);
    } else {
      // store 2d background layer style before forcing to aerial
      selectedBackground2dRef.current = controlState.selectedBackground;
      setBackgroundIndex(AERIAL_BACKGROUND_INDEX);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeaflet]); // intentionally only trigger on mode change

  useEffect(() => {
    if (
      !isLeaflet &&
      isRuntimeReady &&
      runtimeRef.current &&
      controlState.featureInfoModeActivated
    ) {
      const runtime = runtimeRef.current;

      const handler = new ScreenSpaceEventHandler(runtime.scene.canvas);
      handler.setInputAction(async (click) => {
        const terrainProvider = getTerrainProviderById(
          FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020
        );
        if (!terrainProvider) {
          console.warn(
            "[FLOODINGMAP] Cannot process click - terrain provider not available"
          );
          return;
        }

        await onCesiumClick(
          click,
          runtimeRef,
          runtime.scene,
          terrainProvider,
          markerPrimitiveRef,
          highlightPrimitiveRef,
          setCesiumPickedPosition
        );
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        handler.destroy();
        setCesiumPickedPosition(null);

        if (runtime.isDestroyed()) return;

        if (markerPrimitiveRef.current) {
          runtime.scene.primitives.remove(markerPrimitiveRef.current);
          markerPrimitiveRef.current = null;
        }
        if (highlightPrimitiveRef.current) {
          runtime.scene.primitives.remove(highlightPrimitiveRef.current);
          highlightPrimitiveRef.current = null;
        }
        runtime.scene.requestRender();
      };
    }
  }, [
    runtimeRef,
    getTerrainProviderById,
    controlState.featureInfoModeActivated,
    isLeaflet,
    isRuntimeReady,
  ]);

  // Add effect to cleanup marker when feature info mode is disabled
  useEffect(() => {
    if (!controlState.featureInfoModeActivated && runtimeRef.current) {
      if (runtimeRef.current.isDestroyed()) return;

      if (markerPrimitiveRef.current) {
        runtimeRef.current.scene.primitives.remove(markerPrimitiveRef.current);
        markerPrimitiveRef.current = null;
      }
      if (highlightPrimitiveRef.current) {
        runtimeRef.current.scene.primitives.remove(highlightPrimitiveRef.current);
        highlightPrimitiveRef.current = null;
      }
      setCesiumPickedPosition(null);
    }
  }, [runtimeRef, controlState.featureInfoModeActivated]);

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

      const projectedQueryPosition = getWGS84InWebMercator({
        lat: cesiumPickedPosition[0],
        lon: cesiumPickedPosition[1],
      });

      updateHashState(
        {
          [FLOODINGMAP_HASH_KEYS.QUERY_X]: floorToMeterGrid(
            projectedQueryPosition.x
          ),
          [FLOODINGMAP_HASH_KEYS.QUERY_Y]: floorToMeterGrid(
            projectedQueryPosition.y
          ),
        },
        {
          label: "app/hgk:query",
          clearStateKeys: [...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS],
          replace: true,
        }
      );

      executeFeatureInfoRequest({
        lat: cesiumPickedPosition[0],
        lng: cesiumPickedPosition[1],
      });
    }
  }, [
    cesiumPickedPosition,
    controlState.featureInfoModeActivated,
    executeFeatureInfoRequest,
    updateHashState,
  ]);

  useFloodingSceneStyleSync(controlState.selectedSimulation, isHWS, HGK_KEYS);

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
