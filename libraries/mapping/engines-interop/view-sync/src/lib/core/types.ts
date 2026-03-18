import type {
  ObjectCentricCameraModel,
} from "@carma-commons/camera/model";
import type { Store } from "redux";
import type { Meters, Radians } from "@carma/units/types";

export const VIEW_SYNC_ENGINES = {
  CESIUM: "cesium",
  LEAFLET: "leaflet",
  MAPLIBRE: "maplibre",
} as const;

export type BuiltInViewSyncEngine =
  (typeof VIEW_SYNC_ENGINES)[keyof typeof VIEW_SYNC_ENGINES];

export type ViewSyncEngine = BuiltInViewSyncEngine | (string & {});

export type ViewState = {
  // Canonical shared orbit pose (flattened):
  // - local basis follows the shared camera-model convention:
  //   +X east, +Y up, -Z north
  // - bearing starts at north and rotates positively toward east around +Y
  // - pitch is 0=nadir and +PI/2=horizon
  longitude: Radians;
  latitude: Radians;
  altitude: Meters;
  // Canonical projected zoom uses MapLibre/512px-tile semantics.
  zoom?: number;
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
  range: Meters;
  fovVertical?: Radians;
  fovHorizontal?: Radians;
  cameraModel?: ObjectCentricCameraModel;
};

export type ViewSyncPublishedState = {
  sourceId: string;
  sourceEngine: ViewSyncEngine;
  frameNumber: number | null;
  timestampMs: number;
  target: ViewState;
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

export type ViewSyncStore = Store<ViewSyncState> & {
  registerView: (registration: ViewSyncRegistration) => () => void;
  unregisterView: (id: string) => void;
  setController: (id: string | null) => void;
  clearController: () => void;
  publishViewState: (
    id: string,
    target: ViewState,
    options?: ViewSyncPublishOptions
  ) => void;
  setTargetState: (
    target: ViewState,
    options?: ViewSyncSetTargetOptions
  ) => void;
};
