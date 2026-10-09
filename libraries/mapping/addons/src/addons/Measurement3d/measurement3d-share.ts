import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { getHashParams } from "@carma-commons/utils";
import {
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsRuntimePersistenceEnvelope,
} from "@carma-mapping/annotations/runtime";

/**
 * Ad-hoc measurements travel in the URL hash: the runtime GeoJSON of all
 * measurements, lz-string compressed, under one hash parameter. A link with
 * it reproduces a scene with its measurements on any machine, no server
 * round trip; the measurements are appended once on load, existing ids win.
 */
export const MEASUREMENT3D_SHARE_HASH_PARAM = "m3d";

export const encodeMeasurement3dShareParam = (
  collection: AnnotationsRuntimeGeoJsonFeatureCollection
): string => compressToEncodedURIComponent(JSON.stringify(collection));

export const decodeMeasurement3dShareParam = (
  value: string
): AnnotationsRuntimePersistenceEnvelope | null => {
  try {
    // A `+` of the lz-string alphabet comes back as a space from the hash parser.
    const json = decompressFromEncodedURIComponent(value.replace(/ /g, "+"));
    if (!json) return null;
    return resolveAnnotationsRuntimePersistenceFromGeoJson(JSON.parse(json));
  } catch {
    return null;
  }
};

export const readMeasurement3dShareParam = (): string | null => {
  if (typeof window === "undefined") return null;
  const value = getHashParams()[MEASUREMENT3D_SHARE_HASH_PARAM];
  return value ? value : null;
};

/** The current page URL with the measurements parameter set or replaced. */
export const buildMeasurement3dShareUrl = (
  collection: AnnotationsRuntimeGeoJsonFeatureCollection,
  href: string = window.location.href
): string => {
  const [base, hash = ""] = href.split("#");
  const [route, query = ""] = hash.split("?");
  const params = query
    .split("&")
    .filter(
      (pair) =>
        pair.length > 0 &&
        !pair.startsWith(`${MEASUREMENT3D_SHARE_HASH_PARAM}=`)
    );
  params.push(
    `${MEASUREMENT3D_SHARE_HASH_PARAM}=${encodeMeasurement3dShareParam(
      collection
    )}`
  );
  return `${base}#${route}?${params.join("&")}`;
};
