import {
  type SceneStateHashAnchor,
  type SceneStateHashCodec,
  type SceneStateHashSnapshot,
} from "./sceneStateHashTypes";
import { isFiniteNumber } from "./sceneStateHashHelpers";
import { sceneStateHashSnapshotFieldCodecs } from "./sceneStateHashSnapshotFieldCodecs";

const SCENE_STATE_HASH_SNAPSHOT_FIELD_ORDER = Object.keys(
  sceneStateHashSnapshotFieldCodecs
) as Array<keyof typeof sceneStateHashSnapshotFieldCodecs>;

const isSceneStateHashSnapshotLike = (
  value: unknown
): value is SceneStateHashSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SceneStateHashSnapshot>;
  const anchor = candidate.anchor;
  return (
    !!anchor &&
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

export const encodeSceneStateHashSnapshot = (
  snapshot: SceneStateHashSnapshot
): string => {
  const fields = SCENE_STATE_HASH_SNAPSHOT_FIELD_ORDER.map((fieldKey) =>
    sceneStateHashSnapshotFieldCodecs[fieldKey].encode(snapshot)
  );

  while (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  return fields.join(",");
};

export const decodeSceneStateHashSnapshot = (
  value: string | undefined
): SceneStateHashSnapshot | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const fields = value.split(",");
  const lngDeg = sceneStateHashSnapshotFieldCodecs.lngDeg.decode(fields[0]);
  const latDeg = sceneStateHashSnapshotFieldCodecs.latDeg.decode(fields[1]);
  const heightM = sceneStateHashSnapshotFieldCodecs.heightM.decode(fields[2]);
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return undefined;
  }

  const bearingRad = sceneStateHashSnapshotFieldCodecs.bearingRad.decode(
    fields[3]
  );
  const pitchRad = sceneStateHashSnapshotFieldCodecs.pitchRad.decode(fields[4]);
  const rollRad = sceneStateHashSnapshotFieldCodecs.rollRad.decode(fields[5]);
  const fovVerticalRad =
    sceneStateHashSnapshotFieldCodecs.fovVerticalRad.decode(fields[6]);
  const maybeRange = sceneStateHashSnapshotFieldCodecs.rangeM.decode(fields[7]);

  return {
    anchor: {
      lngDeg,
      latDeg,
      heightM,
    },
    orientation: {
      ...(isFiniteNumber(bearingRad) ? { bearingRad } : {}),
      ...(isFiniteNumber(pitchRad) ? { pitchRad } : {}),
      ...(isFiniteNumber(rollRad) ? { rollRad } : {}),
      ...(isFiniteNumber(fovVerticalRad) ? { fovVerticalRad } : {}),
      ...(isFiniteNumber(maybeRange) ? { rangeM: maybeRange } : {}),
    },
  };
};

export const sceneStateHashCodec: SceneStateHashCodec = {
  decode: decodeSceneStateHashSnapshot,
  encode: (value: unknown) => {
    if (!isSceneStateHashSnapshotLike(value)) {
      return undefined;
    }
    return encodeSceneStateHashSnapshot(value);
  },
};
