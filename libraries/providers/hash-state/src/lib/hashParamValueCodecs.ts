import {
  buildOrderedSearchParamsString,
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
} from "@carma-commons/utils";

import {
  HashParamValueCodec,
  StateKeyToHashParamValueCodecMap,
  StateKeyToHashParamNameAliases,
} from "./HashStateProvider";
import {
  sceneViewStateStateKeyToHashParamValueCodecMap,
  sceneViewStateHashParamNameOrder,
  sceneViewStateStateKeyToHashParamNameAliases,
} from "./scene-state-hash/hashParamCodecs";
import { applyHashParamValueCodecs, createHashParamNameMaps } from "./utils";
export const defaultStateKeyToHashParamNameAliases = {
  mapStyle: "m",
  isOblique: "oblq",
  ...sceneViewStateStateKeyToHashParamNameAliases,
};

export const defaultHashParamNameOrder: string[] = [
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
  ...sceneViewStateHashParamNameOrder,
  "m",
  "oblq",
];

// TODO move to a shared location
enum MapStyleKeys {
  TOPO = "karte",
  AERIAL = "luftbild",
}

const mapStyleShortNames: Record<MapStyleKeys, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
};

const getStringLookupCodec = <T extends string>(
  mapping: Record<T, string>
): HashParamValueCodec => {
  const reverse = Object.fromEntries(
    Object.entries(mapping).map(([k, v]) => [v, k])
  );
  return {
    encode: (value: T | unknown) =>
      typeof value === "string" ? mapping[value] : undefined,
    decode: (value: string | undefined) =>
      value !== undefined ? reverse[value] : undefined,
  };
};

export const defaultStateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap =
  Object.freeze({
    mapStyle: getStringLookupCodec(mapStyleShortNames),
    ...sceneViewStateStateKeyToHashParamValueCodecMap,
  });

export type HashParamScalar = string | number | boolean | null | undefined;
export type HashParamScalarMap = Record<string, HashParamScalar>;

type NormalizeHashParamsForWriteOptions = {
  stateKeyToHashParamValueCodecMap?: StateKeyToHashParamValueCodecMap;
  stateKeyAliases?: StateKeyToHashParamNameAliases;
  omittedKeys?: readonly string[];
};

export const normalizeHashParamsForWrite = <T extends HashParamScalar>(
  params: Record<string, T>,
  options: NormalizeHashParamsForWriteOptions = {}
): Record<string, T> => {
  const {
    stateKeyToHashParamValueCodecMap = defaultStateKeyToHashParamValueCodecMap,
    stateKeyAliases = defaultStateKeyToHashParamNameAliases,
    omittedKeys = [],
  } = options;
  const omittedKeySet = new Set(omittedKeys);
  const normalizedParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !omittedKeySet.has(key))
  ) as Record<string, T>;
  const { stateKeyToHashParamName } = createHashParamNameMaps(
    stateKeyToHashParamValueCodecMap,
    stateKeyAliases
  );

  for (const [stateKey, hashParamName] of Object.entries(
    stateKeyToHashParamName
  )) {
    if (stateKey !== hashParamName && hashParamName in normalizedParams) {
      delete normalizedParams[stateKey];
    }
  }

  return normalizedParams;
};

export const encodeHashParams = (params: HashParamScalarMap): string => {
  const { stateKeyToHashParamName } = createHashParamNameMaps(
    defaultStateKeyToHashParamValueCodecMap,
    defaultStateKeyToHashParamNameAliases
  );
  const { newParams } = applyHashParamValueCodecs(
    params,
    defaultStateKeyToHashParamValueCodecMap,
    stateKeyToHashParamName
  );

  return buildOrderedSearchParamsString(
    newParams as HashParamScalarMap,
    defaultHashParamNameOrder
  );
};

export const encodeHashFragment = (params: HashParamScalarMap): string =>
  `#?${encodeHashParams(params)}`;
