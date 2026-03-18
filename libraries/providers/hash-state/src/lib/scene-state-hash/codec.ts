import { type SceneStateHashCodec, type ViewState } from "./types";
import { isFiniteNumber } from "./helpers";
import { sceneStateHashViewStateFieldCodecs } from "./fieldCodecs";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { SCENE_VIEW_STATE_HASH_KEYS } from "./hashKeys";

const SCENE_STATE_HASH_VIEW_STATE_FIELD_ORDER = Object.keys(
  sceneStateHashViewStateFieldCodecs
) as Array<keyof typeof sceneStateHashViewStateFieldCodecs>;

const isViewStateLike = (value: unknown): value is ViewState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ViewState>;
  return (
    isFiniteNumber(candidate.longitude) &&
    isFiniteNumber(candidate.latitude) &&
    isFiniteNumber(candidate.altitude)
  );
};

export const encodeViewState = (viewState: ViewState): string => {
  const fields = SCENE_STATE_HASH_VIEW_STATE_FIELD_ORDER.map((fieldKey) =>
    sceneStateHashViewStateFieldCodecs[fieldKey].encode(viewState)
  );

  while (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  return fields.join(",");
};

export const decodeViewState = (
  value: string | undefined
): ViewState | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const fields = value.split(",");
  const lngDeg =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.LONGITUDE].decode(
      fields[0]
    );
  const latDeg =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.LATITUDE].decode(
      fields[1]
    );
  const heightM =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.ALTITUDE].decode(
      fields[2]
    );
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return undefined;
  }

  const bearingRad =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.BEARING].decode(
      fields[3]
    );
  const pitchRad =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.PITCH].decode(
      fields[4]
    );
  const rollRad =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.ROLL].decode(
      fields[5]
    );
  const fovVerticalRad =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.FOV].decode(
      fields[6]
    );
  const maybeRange =
    sceneStateHashViewStateFieldCodecs[SCENE_VIEW_STATE_HASH_KEYS.RANGE].decode(
      fields[7]
    );

  return {
    longitude: degToRadNumeric(lngDeg)! as Radians,
    latitude: degToRadNumeric(latDeg)! as Radians,
    altitude: heightM as Meters,
    bearing: (isFiniteNumber(bearingRad) ? bearingRad : degToRadNumeric(0)!) as Radians,
    pitch: (isFiniteNumber(pitchRad) ? pitchRad : degToRadNumeric(0)!) as Radians,
    ...(isFiniteNumber(rollRad) ? { roll: rollRad as Radians } : {}),
    ...(isFiniteNumber(fovVerticalRad) ? { fovVertical: fovVerticalRad as Radians } : {}),
    range: (isFiniteNumber(maybeRange) ? maybeRange : 750) as Meters,
  };
};

export const sceneStateHashCodec: SceneStateHashCodec = {
  decode: decodeViewState,
  encode: (value: unknown) => {
    if (!isViewStateLike(value)) {
      return undefined;
    }
    return encodeViewState(value);
  },
};
