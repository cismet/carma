import type { SceneStateHashSnapshot } from "./sceneStateHashTypes";
import {
  decodeAngleRad,
  decodeField,
  encodeAngleDeg,
  toDelimitedField,
} from "./sceneStateHashHelpers";

type SceneStateHashSnapshotFieldCodec = {
  encode: (snapshot: SceneStateHashSnapshot) => string;
  decode: (field: string | undefined) => number | undefined;
};

export const sceneStateHashSnapshotFieldCodecs = {
  lngDeg: {
    encode: (snapshot) => toDelimitedField(snapshot.anchor.lngDeg, 7),
    decode: decodeField,
  } satisfies SceneStateHashSnapshotFieldCodec,
  latDeg: {
    encode: (snapshot) => toDelimitedField(snapshot.anchor.latDeg, 7),
    decode: decodeField,
  } satisfies SceneStateHashSnapshotFieldCodec,
  heightM: {
    encode: (snapshot) => toDelimitedField(snapshot.anchor.heightM, 2),
    decode: decodeField,
  } satisfies SceneStateHashSnapshotFieldCodec,
  bearingRad: {
    encode: (snapshot) =>
      encodeAngleDeg(snapshot.orientation.bearingRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashSnapshotFieldCodec,
  pitchRad: {
    encode: (snapshot) => encodeAngleDeg(snapshot.orientation.pitchRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashSnapshotFieldCodec,
  rollRad: {
    encode: (snapshot) => encodeAngleDeg(snapshot.orientation.rollRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashSnapshotFieldCodec,
  fovVerticalRad: {
    encode: (snapshot) =>
      encodeAngleDeg(snapshot.orientation.fovVerticalRad, 2),
    decode: decodeAngleRad,
  } satisfies SceneStateHashSnapshotFieldCodec,
  rangeM: {
    encode: (snapshot) => toDelimitedField(snapshot.orientation.rangeM, 2),
    decode: decodeField,
  } satisfies SceneStateHashSnapshotFieldCodec,
} as const;
