import type { ReadonlyStore } from "@carma-commons/react-store";
import type {
  CameraType,
  CameraView,
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

export type ViewSyncHeadingPitchRange = {
  heading: Radians;
  pitch: Radians;
  range: Meters;
};

export type ViewSyncTargetState = {
  anchor: ViewSyncAnchor;
  headingPitchRange: ViewSyncHeadingPitchRange;
  roll?: Radians;
  fovVertical?: Radians;
  fovHorizontal?: Radians;
  aspect?: number;
  near?: Meters;
  far?: Meters;
  type?: CameraType;
  view?: CameraView;
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
  headingDeg?: number;
};
