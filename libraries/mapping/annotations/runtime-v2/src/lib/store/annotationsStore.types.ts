import type {
  RuntimeMeasurementType,
  RuntimeToolId,
} from "../types/runtimeTool.types";

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

export type RuntimeAnnotationEntry = {
  id: string;
  toolType: RuntimeMeasurementType;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  displayName?: string;
  labelAppearance?: RuntimeLabelAppearance;
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
  | "labelAppearance"
>;

export type RuntimeMeasurement = RuntimeAnnotationEntry;

export type AnnotationSelectionStoreState = {
  selectedAnnotationIds: readonly string[];
  previousSelectedAnnotationId: string | null;
  selectionModeActive: boolean;
  selectModeAdditive: boolean;
  selectModeRectangle: boolean;
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
