import type { StateKeyToHashParamNameAliases } from "../HashStateProvider";

export const SCENE_VIEW_STATE_HASH_PARAM_NAMES = {
  LATITUDE: "lat",
  LONGITUDE: "lng",
  ZOOM: "zoom",
  ALTITUDE: "altitude",
  BEARING: "bearing",
  PITCH: "pitch",
  ROLL: "roll",
  FOV: "fov",
} as const;

export const SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES: StateKeyToHashParamNameAliases =
  {
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.BEARING]: "b",
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.PITCH]: "p",
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.ROLL]: "r",
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE]: "h",
  };

export const SCENE_VIEW_STATE_HASH_PARAM_NAME_ORDER: string[] = [
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.LATITUDE,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.LONGITUDE,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.ZOOM,
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES[
    SCENE_VIEW_STATE_HASH_PARAM_NAMES.BEARING
  ],
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES[
    SCENE_VIEW_STATE_HASH_PARAM_NAMES.PITCH
  ],
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES[
    SCENE_VIEW_STATE_HASH_PARAM_NAMES.ROLL
  ],
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES[
    SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE
  ],
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.FOV,
];

/**
 * Scene-view-state hash params only a 3D (perspective) view uses. Clearing these
 * on a 3D→2D handover leaves the shared lat/lng/zoom, i.e. a plain top-down view.
 */
export const SCENE_VIEW_STATE_THREE_D_ONLY_HASH_PARAMS: string[] = [
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.BEARING,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.PITCH,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.ROLL,
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.FOV,
];

/**
 * Hash keys an altitude can appear under in a scene-view-state URL: the short URL
 * alias (`h`) plus the canonical name (`altitude`). The launch-mode 3D check
 * consumes this so it recognizes a 3D view from the codec's own key naming rather
 * than hardcoding it — the app wires this into the launch evaluation.
 */
export const SCENE_VIEW_STATE_ALTITUDE_HASH_KEYS: string[] = [
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES[
    SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE
  ],
  SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE,
];
