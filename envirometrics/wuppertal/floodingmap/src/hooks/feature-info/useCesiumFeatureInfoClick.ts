import { useContext, useEffect, useRef, useState } from "react";

import { ScreenSpaceEventHandler, ScreenSpaceEventType } from "@carma-cesium";

import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import { isNumberArrayEqual } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import { useHashState } from "@carma-providers/hash-state";

import { FLOODINGMAP_TERRAIN_PROVIDER_IDS } from "../../config/cesium/cesium.config";
import {
  FLOODINGMAP_HASH_KEYS,
  FLOODINGMAP_QUERY_HASH_CLEAR_KEYS,
} from "../../config/hash-state.config";
import { onCesiumClick } from "../../utils/cesiumHandlers";
import { floorToMeterGrid, getWGS84InWebMercator } from "../../utils/geo";
import type { FeatureInfoMarkerRefs } from "./useFeatureInfoMarker3D";

/** Registers a LEFT_CLICK handler that picks a ground position, places the marker, then writes qx/qy and fires the feature-info request. Marker removal is owned by useFeatureInfoMarker3D. */
export const useCesiumFeatureInfoClick = ({
  markerPrimitiveRef,
  highlightPrimitiveRef,
}: FeatureInfoMarkerRefs) => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { executeFeatureInfoRequest } = useContext<
    typeof EnviroMetricMapDispatchContext
  >(EnviroMetricMapDispatchContext);
  const { isLeaflet } = useMapFrameworkSwitcherContext();
  const { updateHashState } = useHashState();
  const { isRuntimeReady, runtimeRef, getTerrainProviderById } =
    useCesiumContext();

  const [cesiumPickedPosition, setCesiumPickedPosition] = useState<
    [number, number] | null
  >(null);
  const prevPositionRef = useRef<[number, number] | null>(null);

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
      };
    }
  }, [
    runtimeRef,
    getTerrainProviderById,
    controlState.featureInfoModeActivated,
    isLeaflet,
    isRuntimeReady,
    markerPrimitiveRef,
    highlightPrimitiveRef,
  ]);

  useEffect(() => {
    if (
      controlState.featureInfoModeActivated &&
      cesiumPickedPosition &&
      (!prevPositionRef.current ||
        !isNumberArrayEqual(prevPositionRef.current, cesiumPickedPosition))
    ) {
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
};
