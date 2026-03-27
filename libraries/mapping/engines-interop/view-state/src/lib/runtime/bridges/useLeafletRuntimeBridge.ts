import { useMemo } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { WritePriority } from "../../core/types";
import { applyToLeaflet, readFromLeaflet } from "../../adapters/leaflet";
import {
  useSubscribedRuntimeBridge,
  type SubscribedRuntimeBridgeHandle,
} from "./useSubscribedRuntimeBridge";

const attachLeafletListener = (
  map: LeafletMap,
  listener: () => void
): (() => void) => {
  map.on("move", listener);
  map.on("zoom", listener);
  map.whenReady(listener);

  return () => {
    map.off("move", listener);
    map.off("zoom", listener);
  };
};

export type UseLeafletRuntimeBridgeOptions = {
  id: string;
  map?: LeafletMap | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
};

export const useLeafletRuntimeBridge = ({
  id,
  map = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = true,
}: UseLeafletRuntimeBridgeOptions): SubscribedRuntimeBridgeHandle => {
  const adapter = useSubscribedRuntimeBridge({
    id,
    engine: "leaflet",
    runtime: map,
    enabled,
    pushPriority,
    claimPriority,
    claimBeforePush,
    claimOnInteraction,
    read: (runtime, sourceId, seedState) =>
      readFromLeaflet(runtime, sourceId, {
        seedState,
      }),
    apply: applyToLeaflet,
    subscribe: attachLeafletListener,
    getInteractionElement: (runtime) => runtime.getContainer(),
  });

  return useMemo(() => adapter, [adapter]);
};
