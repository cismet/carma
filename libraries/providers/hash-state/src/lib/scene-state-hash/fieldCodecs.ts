import type { ViewState } from "./types";
import { radToDegNumeric } from "@carma/units/helpers";
import {
  decodeAngleRad,
  decodeField,
  encodeAngleDeg,
  toDelimitedField,
} from "./helpers";
import { SCENE_VIEW_STATE_HASH_KEYS } from "./hashKeys";

type SceneStateHashViewStateFieldCodec = {
  encode: (viewState: ViewState) => string;
  decode: (field: string | undefined) => number | undefined;
};

export const sceneStateHashViewStateFieldCodecs = {
  [SCENE_VIEW_STATE_HASH_KEYS.LONGITUDE]: {
    encode: (viewState) =>
      toDelimitedField(radToDegNumeric(viewState.longitude), 7),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.LATITUDE]: {
    encode: (viewState) =>
      toDelimitedField(radToDegNumeric(viewState.latitude), 7),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.ALTITUDE]: {
    encode: (viewState) => toDelimitedField(viewState.altitude, 2),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.BEARING]: {
    encode: (viewState) => encodeAngleDeg(viewState.bearing, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.PITCH]: {
    encode: (viewState) => encodeAngleDeg(viewState.pitch, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.ROLL]: {
    encode: (viewState) => encodeAngleDeg(viewState.roll, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.FOV]: {
    encode: (viewState) => encodeAngleDeg(viewState.fovVertical, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  [SCENE_VIEW_STATE_HASH_KEYS.RANGE]: {
    encode: (viewState) => toDelimitedField(viewState.range, 2),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
} as const;
