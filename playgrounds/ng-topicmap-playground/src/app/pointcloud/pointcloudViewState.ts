export const POINTCLOUD_VIEW_STATE_VERSION = 1;

export interface PersistedMapCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface PersistedPointcloudViewState {
  version: typeof POINTCLOUD_VIEW_STATE_VERSION;
  camera: PersistedMapCamera | null;
  cloudSettings: Record<string, Record<string, unknown>>;
  meshSettings: Record<string, Record<string, unknown>>;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readCamera = (value: unknown): PersistedMapCamera | null => {
  if (!isRecord(value) || !Array.isArray(value.center)) return null;
  const [lng, lat] = value.center;
  if (
    value.center.length !== 2 ||
    !finiteNumber(lng) ||
    !finiteNumber(lat) ||
    !finiteNumber(value.zoom) ||
    !finiteNumber(value.pitch) ||
    !finiteNumber(value.bearing)
  ) {
    return null;
  }
  return {
    center: [lng, lat],
    zoom: value.zoom,
    pitch: value.pitch,
    bearing: value.bearing,
  };
};

const readSettings = (
  value: unknown
): Record<string, Record<string, unknown>> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
    )
  );
};

export const readPointcloudViewState = (
  storageKey: string,
  storage: ReadableStorage
): PersistedPointcloudViewState | null => {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== POINTCLOUD_VIEW_STATE_VERSION) {
      return null;
    }
    return {
      version: POINTCLOUD_VIEW_STATE_VERSION,
      camera: readCamera(value.camera),
      cloudSettings: readSettings(value.cloudSettings),
      meshSettings: readSettings(value.meshSettings),
    };
  } catch {
    return null;
  }
};

export const writePointcloudViewState = <
  CloudSettings extends object,
  MeshSettings extends object
>(
  storageKey: string,
  state: {
    camera: PersistedMapCamera | null;
    cloudSettings: Record<string, CloudSettings>;
    meshSettings: Record<string, MeshSettings>;
  },
  storage: WritableStorage
): void => {
  storage.setItem(
    storageKey,
    JSON.stringify({ version: POINTCLOUD_VIEW_STATE_VERSION, ...state })
  );
};

export const mergePersistedSettings = <T extends object>(
  defaults: T,
  persisted: Record<string, unknown> | undefined
): T => (persisted ? { ...defaults, ...persisted } : defaults);
