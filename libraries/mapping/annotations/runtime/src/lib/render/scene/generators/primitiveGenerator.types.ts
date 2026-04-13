import type {
  AnnotationToolType,
  CandidateConnectionPreview,
  NodeChainAnnotation,
  PointDistanceRelation,
  PolygonPreviewGroup,
  PolylinePreviewMeasurement,
} from "@carma-mapping/annotations/core";

import type { NodeChainPreviewModels } from "../useNodeChainPreviewModels";
import type {
  EdgeSceneLineRenderModel,
  PolygonPrimitiveRenderModel,
} from "../visualization.types";
import type { PolygonAreaBadge } from "../../labels";
export type ToolPrimitiveGeneratorContext = {
  showMeasurementGeometry: boolean;
  candidateConnectionPreview: CandidateConnectionPreview | null;
  effectiveDistanceRelationsForRendering: PointDistanceRelation[];
  activeNodeChainAnnotationId: string | null;
  visiblePolygonAnnotationsForRendering: NodeChainAnnotation[];
  nodeChainPreviewModels: NodeChainPreviewModels;
};

export type ToolPrimitiveSet = {
  previewEdges: readonly EdgeSceneLineRenderModel[];
  distanceRelations: PointDistanceRelation[];
  polylineMeasurements: PolylinePreviewMeasurement[];
  groundPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  verticalPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  planarPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  groundPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  verticalPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  planarPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
};

export type ToolPrimitiveSetByType = Partial<
  Record<AnnotationToolType, ToolPrimitiveSet>
>;

export type ToolPrimitiveGenerationResult = {
  byToolType: ToolPrimitiveSetByType;
  previewEdges: readonly EdgeSceneLineRenderModel[];
  distanceRelations: PointDistanceRelation[];
  polylineMeasurements: PolylinePreviewMeasurement[];
  groundPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  verticalPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  planarPolygonPreviewGroups: readonly PolygonPreviewGroup[];
  groundPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  verticalPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  planarPolygonPrimitives: readonly PolygonPrimitiveRenderModel[];
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

export const createEmptyToolPrimitiveSet = (): ToolPrimitiveSet => ({
  previewEdges: [],
  distanceRelations: [],
  polylineMeasurements: [],
  groundPolygonPreviewGroups: [],
  verticalPolygonPreviewGroups: [],
  planarPolygonPreviewGroups: [],
  groundPolygonPrimitives: [],
  verticalPolygonPrimitives: [],
  planarPolygonPrimitives: [],
});
