import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./annotation-render-models";

export type RuntimeVisualModels = {
  points?: readonly RuntimePointMarkerRenderModel[];
  edges?: readonly RuntimeEdgeRenderModel[];
  polygonFills?: readonly RuntimePolygonFillRenderModel[];
  pointLabels?: readonly RuntimePointLabelRenderModel[];
};
