import { type EditableLineRelationIdsByKind } from "../editable-line-policies";

export type DistanceRelationRenderContext = {
  editableLineRelationIdsByKind: EditableLineRelationIdsByKind;
  selectedOrActiveEditableLineRelationIdsByKind: EditableLineRelationIdsByKind;
  polygonEdgeRelationIds: ReadonlySet<string>;
  planarPolygonSharedEdgeRelationIds: ReadonlySet<string>;
  midpointTickRelationIds: ReadonlySet<string>;
  focusedRelationIds: ReadonlySet<string>;
  selectedOrActiveOpenPolylineRelationIds: ReadonlySet<string>;
  duplicateVerticalOpposingRelationIds: ReadonlySet<string>;
};
