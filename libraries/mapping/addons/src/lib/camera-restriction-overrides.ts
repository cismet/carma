import type { Map as MaplibreMap } from "maplibre-gl";

import {
  setCameraRestrictionOverride,
  type CameraRestriction,
} from "@carma-mapping/engines/maplibre";

/**
 * Addon-owned camera decisions, ordered by how temporary and explicit they are.
 * The engine's forced base (print/export) remains above this whole stack.
 */
export const ADDON_CAMERA_RESTRICTION_PRIORITY = {
  ROUTE: 0,
  INTERACTION: 10,
  FREE_CAMERA: 100,
} as const;

type OverrideRequest = {
  value: AddonCameraPolicy;
  priority: number;
  sequence: number;
};

type AddonCameraPolicy = CameraRestriction & {
  /** Optional bounds owned by the same winning policy as the restriction. */
  minPitch?: number;
  centerClampedToGround?: boolean;
};

type OverrideState = {
  requests: Map<symbol, OverrideRequest>;
  baseline: {
    minPitch: number;
    centerClampedToGround: boolean;
  };
  activeOwner?: symbol;
  activeValue?: AddonCameraPolicy | null;
  minPitchOverridden: boolean;
  centerClampOverridden: boolean;
};

type CoordinatorStore = {
  states: WeakMap<MaplibreMap, OverrideState>;
  sequence: number;
};

type CameraRestrictionHotData = {
  addonCameraRestrictionStore?: CoordinatorStore;
};

const hotData = import.meta.hot?.data as CameraRestrictionHotData | undefined;
const store =
  hotData?.addonCameraRestrictionStore ??
  ({
    states: new WeakMap<MaplibreMap, OverrideState>(),
    sequence: 0,
  } satisfies CoordinatorStore);
if (hotData) hotData.addonCameraRestrictionStore = store;

const sameRestriction = (
  left: AddonCameraPolicy | null | undefined,
  right: AddonCameraPolicy | null
): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.restricted === right.restricted &&
    left.maxPitch === right.maxPitch &&
    left.minPitch === right.minPitch &&
    left.centerClampedToGround === right.centerClampedToGround);

const applyAuxiliaryCameraPolicy = (
  map: MaplibreMap,
  state: OverrideState,
  value: AddonCameraPolicy | null
) => {
  if (value?.minPitch !== undefined) {
    // The restriction override has already raised maxPitch, so this order also
    // works when the map previously had a higher minimum than the new maximum.
    map.setMinPitch(value.minPitch);
    state.minPitchOverridden = true;
  } else if (state.minPitchOverridden) {
    map.setMinPitch(Math.min(state.baseline.minPitch, map.getMaxPitch()));
    state.minPitchOverridden = false;
  }

  if (value?.centerClampedToGround !== undefined) {
    map.setCenterClampedToGround(value.centerClampedToGround);
    state.centerClampOverridden = true;
  } else if (state.centerClampOverridden) {
    map.setCenterClampedToGround(state.baseline.centerClampedToGround);
    state.centerClampOverridden = false;
  }
};

const publishWinner = (map: MaplibreMap, state: OverrideState) => {
  let winner: { owner: symbol; request: OverrideRequest } | undefined;
  for (const [owner, request] of state.requests) {
    if (
      !winner ||
      request.priority > winner.request.priority ||
      (request.priority === winner.request.priority &&
        request.sequence > winner.request.sequence)
    ) {
      winner = { owner, request };
    }
  }

  const owner = winner?.owner;
  const value = winner?.request.value ?? null;
  if (
    state.activeOwner === owner &&
    sameRestriction(state.activeValue, value)
  ) {
    return;
  }

  state.activeOwner = owner;
  state.activeValue = value;
  setCameraRestrictionOverride(
    map,
    value
      ? { restricted: value.restricted, maxPitch: value.maxPitch }
      : null
  );
  applyAuxiliaryCameraPolicy(map, state, value);
};

/**
 * Publish one addon's camera policy without letting another addon's cleanup
 * erase it. Higher priorities win; removing a winner restores the next request.
 */
export const setAddonCameraRestriction = (
  map: MaplibreMap,
  owner: symbol,
  value: AddonCameraPolicy | null,
  priority: number = ADDON_CAMERA_RESTRICTION_PRIORITY.ROUTE
) => {
  const state = store.states.get(map);
  if (!state && !value) {
    return;
  }

  const nextState =
    state ??
    ({
      requests: new Map<symbol, OverrideRequest>(),
      baseline: {
        minPitch: map.getMinPitch(),
        centerClampedToGround: map.getCenterClampedToGround(),
      },
      minPitchOverridden: false,
      centerClampOverridden: false,
    } satisfies OverrideState);
  if (!state) {
    store.states.set(map, nextState);
  }

  if (value) {
    nextState.requests.set(owner, {
      value,
      priority,
      sequence: ++store.sequence,
    });
  } else {
    nextState.requests.delete(owner);
  }

  publishWinner(map, nextState);
  if (nextState.requests.size === 0) {
    store.states.delete(map);
  }
};
