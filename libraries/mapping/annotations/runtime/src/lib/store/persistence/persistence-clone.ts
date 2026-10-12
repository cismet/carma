import type {
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  StoredAnnotation,
} from "../annotations-store.types";

export const cloneAnnotationEntry = (
  annotationEntry: StoredAnnotation
): StoredAnnotation => {
  const { nodeIds, edgeIds, ...rest } = annotationEntry;

  return {
    ...rest,
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
  };
};

export const cloneNode = (node: AnnotationNode): AnnotationNode => ({
  ...node,
  coordinate: { ...node.coordinate },
});

export const cloneEdge = (edge: AnnotationEdge): AnnotationEdge => ({
  ...edge,
});

export const cloneNodeLink = (
  nodeLink: AnnotationNodeLink
): AnnotationNodeLink => ({
  ...nodeLink,
  nodeIds: [...nodeLink.nodeIds],
});
