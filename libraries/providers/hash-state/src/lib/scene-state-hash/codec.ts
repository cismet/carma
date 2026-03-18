import { type SceneStateHashCodec, type SceneViewState } from "./types";
import { isFiniteNumber } from "./helpers";
import { sceneStateHashViewStateFieldCodecs } from "./fieldCodecs";

const SCENE_STATE_HASH_VIEW_STATE_FIELD_ORDER = Object.keys(
  sceneStateHashViewStateFieldCodecs
) as Array<keyof typeof sceneStateHashViewStateFieldCodecs>;

const isSceneViewStateLike = (value: unknown): value is SceneViewState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SceneViewState>;
  const anchor = candidate.anchor;
  return (
    !!anchor &&
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

export const encodeSceneViewState = (viewState: SceneViewState): string => {
  const fields = SCENE_STATE_HASH_VIEW_STATE_FIELD_ORDER.map((fieldKey) =>
    sceneStateHashViewStateFieldCodecs[fieldKey].encode(viewState)
  );

  while (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  return fields.join(",");
};

export const decodeSceneViewState = (
  value: string | undefined
): SceneViewState | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const fields = value.split(",");
  const lngDeg = sceneStateHashViewStateFieldCodecs.lngDeg.decode(fields[0]);
  const latDeg = sceneStateHashViewStateFieldCodecs.latDeg.decode(fields[1]);
  const heightM = sceneStateHashViewStateFieldCodecs.heightM.decode(fields[2]);
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return undefined;
  }

  const bearingRad = sceneStateHashViewStateFieldCodecs.bearingRad.decode(
    fields[3]
  );
  const pitchRad = sceneStateHashViewStateFieldCodecs.pitchRad.decode(
    fields[4]
  );
  const rollRad = sceneStateHashViewStateFieldCodecs.rollRad.decode(fields[5]);
  const fovVerticalRad =
    sceneStateHashViewStateFieldCodecs.fovVerticalRad.decode(fields[6]);
  const maybeRange = sceneStateHashViewStateFieldCodecs.rangeM.decode(
    fields[7]
  );

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
  decode: decodeSceneViewState,
  encode: (value: unknown) => {
    if (!isSceneViewStateLike(value)) {
      return undefined;
    }
    return encodeSceneViewState(value);
  },
};
