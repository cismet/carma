import type { ReadonlyStore } from "@carma-commons/react-store";
import type {
  CameraType,
  CameraViewOffset,
  ObjectCentricCameraAnchor,
  ObjectCentricCameraModel,
} from "@carma-commons/camera/model";
import type { Meters, Radians } from "@carma/units/types";

export const VIEW_SYNC_ENGINES = {
  CESIUM: "cesium",
  LEAFLET: "leaflet",
  MAPLIBRE: "maplibre",
} as const;

export type BuiltInViewSyncEngine =
  (typeof VIEW_SYNC_ENGINES)[keyof typeof VIEW_SYNC_ENGINES];

export type ViewSyncEngine = BuiltInViewSyncEngine | (string & {});

export type ViewSyncAnchor = ObjectCentricCameraAnchor;

// Canonical shared orbit pose:
// - local basis follows the shared camera-model convention:
//   +X east, +Y up, -Z north
// - bearing starts at north and rotates positively toward east around +Y
// - pitch is 0=nadir and +PI/2=horizon
export type ViewSyncBearingPitchRange = {
  bearing: Radians;
  pitch: Radians;
  range: Meters;
};

export type ViewSyncTargetState = {
  anchor: ViewSyncAnchor;
  bearingPitchRange: ViewSyncBearingPitchRange;
  roll?: Radians;
  fovVertical?: Radians;
  fovHorizontal?: Radians;
  aspect?: number;
  near?: Meters;
  far?: Meters;
  type?: CameraType;
  viewOffset?: CameraViewOffset;
  cameraModel?: ObjectCentricCameraModel;
};

export type ViewSyncPublishedState = {
  sourceId: string;
  sourceEngine: ViewSyncEngine;
  frameNumber: number | null;
  timestampMs: number;
  target: ViewSyncTargetState;
};

export type ViewSyncRegistration = {
  id: string;
  engine: ViewSyncEngine;
  label?: string;
  canControl?: boolean;
};

export type ViewSyncState = {
  registrations: Record<string, ViewSyncRegistration>;
  latestById: Record<string, ViewSyncPublishedState>;
  controllerId: string | null;
  target: ViewSyncPublishedState | null;
};

export type ViewSyncPublishOptions = {
  frameNumber?: number | null;
  timestampMs?: number;
  claimControl?: boolean;
};

export type ViewSyncSetTargetOptions = {
  sourceId?: string;
  sourceEngine?: ViewSyncEngine;
  frameNumber?: number | null;
  timestampMs?: number;
};

export type ViewSyncStore = ReadonlyStore<ViewSyncState> & {
  registerView: (registration: ViewSyncRegistration) => () => void;
  unregisterView: (id: string) => void;
  setController: (id: string | null) => void;
  clearController: () => void;
  publishViewState: (
    id: string,
    target: ViewSyncTargetState,
    options?: ViewSyncPublishOptions
  ) => void;
  setTargetState: (
    target: ViewSyncTargetState,
    options?: ViewSyncSetTargetOptions
  ) => void;
};

export type ViewSyncViewport = {
  widthPx: number;
  heightPx: number;
};

export type ViewSyncMapLibreProjection = {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

export type ViewSyncLeafletProjection = {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  bearingDeg?: number;
};
