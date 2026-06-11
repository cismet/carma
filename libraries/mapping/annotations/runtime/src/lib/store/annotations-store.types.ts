import type {
  AnnotationLabelAppearance,
  AnnotationType,
} from "@carma-mapping/annotations/core";
import type { CesiumGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import type {
  RuntimeDistanceTriangleAnchorCoordinateRole,
  RuntimePointLabelCoordinateSelection,
} from "../render/measurement-render-models";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
export type { CesiumGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
export type { AnnotationLabelAppearance } from "@carma-mapping/annotations/core";

export type AnnotationNodeLinkId = string;

export type AnnotationNode = {
  id: string;
  coordinate: CesiumGeographicCoordinate;
};

export type AnnotationNodeId = AnnotationNode["id"];

export type AnnotationNodeLink = {
  id: AnnotationNodeLinkId;
  nodeIds: string[];
};

export type AnnotationEdge = {
  id: string;
  startNodeId: string;
  endNodeId: string;
};

export const ANNOTATION_ENTRY_ROLES = {
  AUTHORING: "authoring",
  EXTERNAL: "external",
} as const;

export type AnnotationEntryRole =
  (typeof ANNOTATION_ENTRY_ROLES)[keyof typeof ANNOTATION_ENTRY_ROLES];

export const ANNOTATION_ELEVATION_DISPLAY_MODES = {
  RELATIVE: "relative",
  ABSOLUTE: "absolute",
} as const;

export type AnnotationElevationDisplayMode =
  (typeof ANNOTATION_ELEVATION_DISPLAY_MODES)[keyof typeof ANNOTATION_ELEVATION_DISPLAY_MODES];

export type StoredAnnotation = {
  id: string;
  toolType: AnnotationType;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  displayName?: string;
  shortLabel?: string;
  hidden?: boolean;
  locked?: boolean;
  annotationRole?: AnnotationEntryRole;
  readOnly?: boolean;
  labelAppearance?: AnnotationLabelAppearance;
  elevationDisplayMode?: AnnotationElevationDisplayMode;
  distanceAnchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
  distanceTriangleAnchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
  closed?: boolean;
  preferredNormalBearingRad?: number;
  externalCollection?: {
    type: "saved-measurement";
    id: string;
  };
};

export type AddAnnotationOptions = Pick<
  StoredAnnotation,
  | "closed"
  | "preferredNormalBearingRad"
  | "displayName"
  | "shortLabel"
  | "hidden"
  | "locked"
  | "labelAppearance"
  | "elevationDisplayMode"
  | "distanceAnchorCoordinateSelection"
  | "distanceTriangleAnchorCoordinateRole"
>;

export type AnnotationSelectionStoreState = {
  selectedAnnotationIds: readonly string[];
  previousSelectedAnnotationId: string | null;
};

export type AnnotationInfoBoxStoreState = {
  activeAnnotationId: string | null;
};

export type AnnotationSettingsStoreState = {
  pointTemporaryMode: boolean;
  elevationReferenceAnnotationId: string | null;
  nextShortLabelCounterByToolType: Readonly<Record<string, number>>;
};

export type AnnotationsStoreState = {
  annotationToolType: AnnotationToolId;
  selectionState: AnnotationSelectionStoreState;
  annotationEntries: readonly StoredAnnotation[];
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  edges: readonly AnnotationEdge[];
  infoBoxState: AnnotationInfoBoxStoreState;
  settingsState: AnnotationSettingsStoreState;
};
