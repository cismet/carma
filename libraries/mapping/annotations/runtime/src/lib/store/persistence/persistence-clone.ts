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

/** An entry read from storage: version 2 sets carry an updatedAt that is not kept. */
export const readAnnotationEntry = (
  annotationEntry: StoredAnnotation
): StoredAnnotation => {
  const entry: StoredAnnotation & { updatedAt?: unknown } =
    cloneAnnotationEntry(annotationEntry);
  delete entry.updatedAt;
  return entry;
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
