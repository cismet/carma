import type { Map as MaplibreMap } from "maplibre-gl";

type StyleImage = ReturnType<MaplibreMap["getImage"]>;

export type MapStyleImageRevision = Readonly<{
  version: number;
  width?: number;
  height?: number;
  bytes?: Uint8Array;
}>;

/** MapLibre 5 sprite images can omit version; updateImage then produces NaN.
 * Decision: retain exact bytes only for those unversioned images. NaN-safe
 * version comparison alone misses updateImage's in-place buffer writes, while
 * normal versioned images keep their constant-time comparison without a copy.
 */
export const snapshotMapStyleImageRevision = (
  image: StyleImage
): MapStyleImageRevision => ({
  version: image.version,
  ...(!Number.isFinite(image.version) && image.data
    ? {
        width: image.data.width,
        height: image.data.height,
        bytes: new Uint8Array(image.data.data),
      }
    : {}),
});

export const matchesMapStyleImageRevision = (
  image: StyleImage | undefined,
  snapshot: MapStyleImageRevision
): boolean => {
  if (!image || !Object.is(image.version, snapshot.version)) return false;
  if (Number.isFinite(snapshot.version)) return true;
  const actual = image.data;
  const expected = snapshot.bytes;
  if (
    !actual ||
    !expected ||
    actual.width !== snapshot.width ||
    actual.height !== snapshot.height ||
    actual.data.length !== expected.length
  )
    return false;
  for (let index = 0; index < expected.length; index += 1)
    if (actual.data[index] !== expected[index]) return false;
  return true;
};
