import { useMemo } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { WritePriority } from "../../core/types";
import { applyToMaplibre, readFromMaplibre } from "../../adapters/maplibre";
import {
  useLiveRuntimeBridge,
  type LiveRuntimeBridgeHandle,
} from "./useLiveRuntimeBridge";

const attachMaplibreListener = (
  map: MapLibreMap,
  listener: () => void
): (() => void) => {
  map.on("load", listener);
  map.on("move", listener);
  map.on("rotate", listener);
  map.on("pitch", listener);
  map.on("resize", listener);

  return () => {
    map.off("load", listener);
    map.off("move", listener);
    map.off("rotate", listener);
    map.off("pitch", listener);
    map.off("resize", listener);
  };
};

export type UseMaplibreRuntimeBridgeOptions = {
  id: string;
  map?: MapLibreMap | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
};

export type MaplibreRuntimeBridgeHandle = LiveRuntimeBridgeHandle;

export const useMaplibreRuntimeBridge = ({
  id,
  map = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = true,
}: UseMaplibreRuntimeBridgeOptions): MaplibreRuntimeBridgeHandle => {
  const adapter = useLiveRuntimeBridge({
    id,
    engine: "maplibre",
    runtime: map,
    enabled,
    pushPriority,
    claimPriority,
    claimBeforePush,
    claimOnInteraction,
    read: (runtime, sourceId, seedState) =>
      readFromMaplibre(runtime, sourceId, {
        seedState,
      }),
    apply: applyToMaplibre,
    subscribe: attachMaplibreListener,
    getInteractionElement: (runtime) => runtime.getContainer(),
  });

  return useMemo(() => adapter, [adapter]);
};
