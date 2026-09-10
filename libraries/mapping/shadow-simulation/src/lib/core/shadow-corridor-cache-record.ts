export const SHADOW_CORRIDOR_CACHE = {
  namespace: "shadow-corridor-visibility",
  schema: "visibility-depth-world-basis-v1",
  maximumPayloadBytes: 32 * 1024 ** 2,
  maximumRecordBytes: 33 * 1024 ** 2,
  maximumIdentityCharacters: 65536,
} as const;

export const SHADOW_CORRIDOR_CACHE_OPERATION = {
  read: "read",
  write: "write",
  writePacked: "write-packed",
} as const;

/** Caller-owned physical identity. Camera, albedo and session counters do not
 * belong here. Source and geometry fingerprints must cover all corridor casters.
 */
export type ShadowCorridorCacheIdentity = Readonly<{
  source: string;
  dateTime: string;
  corridor: string;
  resolution: string;
  geometryFingerprint: string;
  samples: number;
}>;

export type ShadowCorridorCacheCapture = Readonly<{
  width: number;
  height: number;
  visibility: Float32Array;
  depth: Float32Array;
  /** Column-major scene-local to capture clip transform. */
  captureMatrix: readonly number[];
  crop: readonly number[];
  /** Column-major scene-local to the caller's stable world coordinate basis.
   * Restore must convert this basis before using captureMatrix in another scene.
   */
  worldBasis: readonly number[];
}>;

export type ShadowCorridorCacheRecord = ShadowCorridorCacheCapture &
  Readonly<{
    identity: ShadowCorridorCacheIdentity;
    schema: typeof SHADOW_CORRIDOR_CACHE.schema;
  }>;

export type ShadowCorridorPackedCapture = Omit<
  ShadowCorridorCacheCapture,
  "visibility" | "depth"
> &
  Readonly<{ rgba: Float32Array }>;

export const shadowCorridorCacheKey = (
  identity: ShadowCorridorCacheIdentity
): string | null => {
  if (
    !identity ||
    !Number.isInteger(identity.samples) ||
    identity.samples < 1 ||
    identity.samples > 4096
  )
    return null;
  const fields = [
    identity.source,
    identity.dateTime,
    identity.corridor,
    identity.resolution,
    identity.geometryFingerprint,
  ];
  if (
    fields.some((value) => typeof value !== "string" || value.length === 0) ||
    fields.reduce((length, value) => length + value.length, 0) >
      SHADOW_CORRIDOR_CACHE.maximumIdentityCharacters
  )
    return null;
  return JSON.stringify([
    SHADOW_CORRIDOR_CACHE.schema,
    ...fields,
    identity.samples,
  ]);
};

const finiteArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(Number.isFinite);

/** Cheap envelope check for the rendering thread; full pixel validation is worker-only. */
const hasCaptureCoordinates = (
  value: unknown
): value is Omit<ShadowCorridorCacheCapture, "visibility" | "depth"> => {
  if (!value || typeof value !== "object") return false;
  const capture = value as ShadowCorridorCacheCapture;
  const pixels = capture.width * capture.height;
  return (
    Number.isSafeInteger(capture.width) &&
    capture.width > 0 &&
    Number.isSafeInteger(capture.height) &&
    capture.height > 0 &&
    Number.isSafeInteger(pixels) &&
    pixels * 8 <= SHADOW_CORRIDOR_CACHE.maximumPayloadBytes &&
    finiteArray(capture.captureMatrix, 16) &&
    finiteArray(capture.worldBasis, 16) &&
    finiteArray(capture.crop, 4) &&
    capture.crop[0] >= 0 &&
    capture.crop[1] >= 0 &&
    capture.crop[2] > 0 &&
    capture.crop[3] > 0 &&
    capture.crop[0] + capture.crop[2] <= 1.000001 &&
    capture.crop[1] + capture.crop[3] <= 1.000001
  );
};

export const isShadowCorridorCaptureEnvelope = (
  value: unknown
): value is ShadowCorridorCacheCapture => {
  if (!hasCaptureCoordinates(value)) return false;
  const capture = value as ShadowCorridorCacheCapture;
  const pixels = capture.width * capture.height;
  return (
    capture.visibility instanceof Float32Array &&
    capture.visibility.length === pixels &&
    capture.depth instanceof Float32Array &&
    capture.depth.length === pixels
  );
};

export const isShadowCorridorPackedEnvelope = (
  value: unknown
): value is ShadowCorridorPackedCapture => {
  if (!hasCaptureCoordinates(value)) return false;
  const capture = value as ShadowCorridorPackedCapture;
  return (
    capture.rgba instanceof Float32Array &&
    capture.rgba.length === capture.width * capture.height * 4
  );
};

export const isShadowCorridorCacheRecord = (
  value: unknown,
  expectedIdentity: ShadowCorridorCacheIdentity
): value is ShadowCorridorCacheRecord => {
  if (!isShadowCorridorCaptureEnvelope(value)) return false;
  const record = value as ShadowCorridorCacheRecord;
  const expectedKey = shadowCorridorCacheKey(expectedIdentity);
  if (
    !expectedKey ||
    record.schema !== SHADOW_CORRIDOR_CACHE.schema ||
    shadowCorridorCacheKey(record.identity) !== expectedKey
  )
    return false;
  for (let index = 0; index < record.visibility.length; index += 1) {
    const visibility = record.visibility[index];
    const depth = record.depth[index];
    if (
      !Number.isFinite(visibility) ||
      visibility < 0 ||
      visibility > 1 ||
      !Number.isFinite(depth) ||
      depth < 0 ||
      depth > 1
    )
      return false;
  }
  return true;
};
