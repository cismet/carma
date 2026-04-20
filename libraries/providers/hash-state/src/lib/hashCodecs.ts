import {
  buildOrderedSearchParamsString,
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
} from "@carma-commons/utils";

import { HashCodec, HashCodecs } from "./HashStateProvider";
import {
  sceneViewStateHashCodecs,
  sceneViewStateHashKeyAliases,
  sceneViewStateHashKeyOrder,
} from "./scene-state-hash/hashParamCodecs";
import { applyHashCodecs } from "./utils";
export const defaultHashKeyAliases = {
  mapStyle: "m",
  isOblique: "oblq",
  ...sceneViewStateHashKeyAliases,
};

export const defaultHashKeyOrder: string[] = [
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
  ...sceneViewStateHashKeyOrder,
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
): HashCodec => {
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

export const defaultHashCodecs: HashCodecs = Object.freeze({
  mapStyle: getStringLookupCodec(mapStyleShortNames),
  ...sceneViewStateHashCodecs,
});

export type HashParamScalar = string | number | boolean | null | undefined;
export type HashParams = Record<string, HashParamScalar>;

export const encodeHashParams = (params: HashParams): string => {
  const { newParams } = applyHashCodecs(
    params,
    defaultHashCodecs,
    defaultHashKeyAliases
  );
  const typedParams = newParams as HashParams;
  const orderedEntries = Object.entries(typedParams).sort(([keyA], [keyB]) => {
    const indexA = defaultHashKeyOrder.indexOf(keyA);
    const indexB = defaultHashKeyOrder.indexOf(keyB);
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) {
      return -1;
    }
    if (indexB !== -1) {
      return 1;
    }
    return 0;
  });

  const encoded = buildOrderedSearchParamsString(
    Object.fromEntries(orderedEntries) as HashParams,
    defaultHashKeyOrder
  );
  return encoded;
};

export const encodeHashFragment = (params: HashParams): string =>
  `#?${encodeHashParams(params)}`;
