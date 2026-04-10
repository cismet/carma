import type {
  RuntimeMeasurementType,
  RuntimeToolId,
} from "../types/runtimeTool.types";
import type {
  RuntimeDistanceTriangleAnchorCoordinateRole,
  RuntimePointLabelCoordinateSelection,
} from "../render/measurementRenderModels";

export type RuntimeCoordinate = {
  latitude: number;
  longitude: number;
  altitude: number;
};

export type RuntimeNode = {
  id: string;
  coordinate: RuntimeCoordinate;
};

export type RuntimeEdge = {
  id: string;
  startNodeId: string;
  endNodeId: string;
};

export const RUNTIME_ELEVATION_DISPLAY_MODE = {
  RELATIVE: "relative",
  ABSOLUTE: "absolute",
} as const;

export type RuntimeElevationDisplayMode =
  (typeof RUNTIME_ELEVATION_DISPLAY_MODE)[keyof typeof RUNTIME_ELEVATION_DISPLAY_MODE];

export type RuntimeAnnotationEntry = {
  id: string;
  toolType: RuntimeMeasurementType;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  displayName?: string;
  shortLabel?: string;
  hidden?: boolean;
  locked?: boolean;
  labelAppearance?: RuntimeLabelAppearance;
  elevationDisplayMode?: RuntimeElevationDisplayMode;
  distanceAnchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
  distanceTriangleAnchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
  temporary?: boolean;
  closed?: boolean;
  areaSquareMeters?: number;
  verticalityDeg?: number;
  bearingDeg?: number;
};

export type RuntimeLabelAppearance = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};

export type RuntimeAddAnnotationOptions = Pick<
  RuntimeAnnotationEntry,
  | "closed"
  | "areaSquareMeters"
  | "verticalityDeg"
  | "bearingDeg"
  | "displayName"
  | "shortLabel"
  | "hidden"
  | "locked"
  | "labelAppearance"
  | "elevationDisplayMode"
  | "distanceAnchorCoordinateSelection"
  | "distanceTriangleAnchorCoordinateRole"
>;

export type RuntimeMeasurement = RuntimeAnnotationEntry;

export type AnnotationSelectionStoreState = {
  selectedAnnotationIds: readonly string[];
  previousSelectedAnnotationId: string | null;
};

export type AnnotationInfoBoxStoreState = {
  activeAnnotationId: string | null;
};

export type AnnotationDraftStoreState = {
  draftCoordinatesByToolType: Readonly<
    Partial<Record<RuntimeToolId, readonly RuntimeCoordinate[]>>
  >;
  pendingAnnotationIdByToolType: Readonly<
    Partial<Record<RuntimeToolId, string | null>>
  >;
};

export type AnnotationSettingsStoreState = {
  pointTemporaryMode: boolean;
  elevationReferenceAnnotationId: string | null;
  nextShortLabelCounterByToolType: Readonly<Record<string, number>>;
};

export type AnnotationsStoreState = {
  annotationToolType: RuntimeToolId;
  selectionState: AnnotationSelectionStoreState;
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  infoBoxState: AnnotationInfoBoxStoreState;
  settingsState: AnnotationSettingsStoreState;
  draftState: AnnotationDraftStoreState;
};
