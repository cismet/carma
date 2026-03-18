import type { SceneViewState } from "./types";
import {
  decodeAngleRad,
  decodeField,
  encodeAngleDeg,
  toDelimitedField,
} from "./helpers";

type SceneStateHashViewStateFieldCodec = {
  encode: (viewState: SceneViewState) => string;
  decode: (field: string | undefined) => number | undefined;
};

export const sceneStateHashViewStateFieldCodecs = {
  lngDeg: {
    encode: (viewState) => toDelimitedField(viewState.anchor.lngDeg, 7),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  latDeg: {
    encode: (viewState) => toDelimitedField(viewState.anchor.latDeg, 7),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  heightM: {
    encode: (viewState) => toDelimitedField(viewState.anchor.heightM, 2),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
  bearingRad: {
    encode: (viewState) => encodeAngleDeg(viewState.orientation.bearingRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  pitchRad: {
    encode: (viewState) => encodeAngleDeg(viewState.orientation.pitchRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  rollRad: {
    encode: (viewState) => encodeAngleDeg(viewState.orientation.rollRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  fovVerticalRad: {
    encode: (viewState) =>
      encodeAngleDeg(viewState.orientation.fovVerticalRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashViewStateFieldCodec,
  rangeM: {
    encode: (viewState) => toDelimitedField(viewState.orientation.rangeM, 2),
    decode: decodeField,
  } satisfies SceneStateHashViewStateFieldCodec,
} as const;
