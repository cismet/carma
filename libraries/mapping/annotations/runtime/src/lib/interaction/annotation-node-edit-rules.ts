import {
  ANNOTATION_TYPES,
  type AnnotationType,
} from "@carma-mapping/annotations/core";

/**
 * The degrees of freedom a node keeps while it is edited, per measurement
 * type. The point-move gizmo offers exactly the handles a rule allows, and
 * every move is held to the rule's frame afterwards, so neither a drag, a
 * node snap nor a copied reference value can take the node out of it.
 *
 * A rule belongs to a tool (`AnnotationToolPlugin.nodeEdit`), the default
 * tools declare them through the `nodeEditRules` option of
 * `createDefaultAnnotationToolPlugins`. Measurements of a tool without a rule
 * are edited freely.
 *
 * - FREE: anywhere in space. Height arrows along the local vertical, a
 *   horizontal disc, the centre handle following the surface under the
 *   pointer, and the axes of a clicked reference edge.
 * - GROUND: a footprint corner. Its area is measured in the horizontal, so a
 *   height arrow would change nothing that is measured: horizontal disc and
 *   surface drag only.
 * - MEASUREMENT_PLANE: a corner of an area that defines its own plane (a
 *   roof or a wall). The disc lies in that plane, the centre handle drags in
 *   it, and every move is projected back onto it. No arrows: one along the
 *   plane normal would only be undone by the projection, and one along the
 *   vertical moves a roof corner by the sine of its pitch and a wall corner
 *   out of the wall.
 */
export const ANNOTATION_NODE_EDIT_FRAMES = {
  FREE: "free",
  GROUND: "ground",
  MEASUREMENT_PLANE: "measurement-plane",
} as const;

export type AnnotationNodeEditFrame =
  (typeof ANNOTATION_NODE_EDIT_FRAMES)[keyof typeof ANNOTATION_NODE_EDIT_FRAMES];

export type AnnotationNodeEditRule = {
  frame: AnnotationNodeEditFrame;
  /** Axis arrows: the local vertical, or the three axes of a reference edge. */
  axes: boolean;
  /** The centre handle follows the surface under the pointer, unless a plane is held. */
  surfaceDrag: boolean;
  /** Moves are projected onto the measurement's own plane. */
  projectOntoMeasurementPlane: boolean;
  /** A snap may join a node off the held plane; by default it is refused. */
  joinOffPlaneNodes?: boolean;
};

/** What a node without a declared rule gets: free, with arrows and surface drag. */
export const FREE_ANNOTATION_NODE_EDIT_RULE: AnnotationNodeEditRule =
  Object.freeze({
    frame: ANNOTATION_NODE_EDIT_FRAMES.FREE,
    axes: true,
    surfaceDrag: true,
    projectOntoMeasurementPlane: false,
  });

const GROUND_RULE: AnnotationNodeEditRule = Object.freeze({
  frame: ANNOTATION_NODE_EDIT_FRAMES.GROUND,
  axes: false,
  surfaceDrag: true,
  projectOntoMeasurementPlane: false,
});

const MEASUREMENT_PLANE_RULE: AnnotationNodeEditRule = Object.freeze({
  frame: ANNOTATION_NODE_EDIT_FRAMES.MEASUREMENT_PLANE,
  axes: false,
  surfaceDrag: false,
  projectOntoMeasurementPlane: true,
});

/**
 * The roof corner without per-type rules: held to the roof plane like the
 * measurement-plane rule, but the arrows stay and a snap may join a node off
 * the plane. Every other type is free.
 */
export const BASIC_ANNOTATION_NODE_EDIT_RULES: Readonly<
  Partial<Record<AnnotationType, AnnotationNodeEditRule>>
> = Object.freeze({
  [ANNOTATION_TYPES.AREA_PLANAR]: Object.freeze({
    frame: ANNOTATION_NODE_EDIT_FRAMES.MEASUREMENT_PLANE,
    axes: true,
    surfaceDrag: true,
    projectOntoMeasurementPlane: true,
    joinOffPlaneNodes: true,
  }),
});

export const ANNOTATION_NODE_EDIT_RULES: Readonly<
  Record<AnnotationType, AnnotationNodeEditRule>
> = Object.freeze({
  [ANNOTATION_TYPES.POINT]: FREE_ANNOTATION_NODE_EDIT_RULE,
  [ANNOTATION_TYPES.DISTANCE]: FREE_ANNOTATION_NODE_EDIT_RULE,
  [ANNOTATION_TYPES.POLYLINE]: FREE_ANNOTATION_NODE_EDIT_RULE,
  [ANNOTATION_TYPES.LABEL]: FREE_ANNOTATION_NODE_EDIT_RULE,
  [ANNOTATION_TYPES.AREA_GROUND]: GROUND_RULE,
  [ANNOTATION_TYPES.AREA_PLANAR]: MEASUREMENT_PLANE_RULE,
  [ANNOTATION_TYPES.AREA_VERTICAL]: MEASUREMENT_PLANE_RULE,
});

/** The rule of a measurement type; an unknown type edits freely. */
export const resolveAnnotationNodeEditRule = (
  toolType: string | null | undefined
): AnnotationNodeEditRule =>
  (toolType && ANNOTATION_NODE_EDIT_RULES[toolType as AnnotationType]) ||
  FREE_ANNOTATION_NODE_EDIT_RULE;

/**
 * The measurement whose rule governs a node: the most recently selected
 * measurement that holds it, else the first that does, among those `governs`
 * accepts (default all). A node shared with a roof follows the roof only
 * while the roof is the one being edited.
 */
export const resolveEditedMeasurementForNode = <
  T extends { id: string; nodeIds: readonly string[] }
>(
  nodeId: string,
  annotationEntries: readonly T[],
  selectedAnnotationIds: readonly string[],
  governs: (entry: T) => boolean = () => true
): T | null => {
  const candidates = annotationEntries.filter(
    (entry) => entry.nodeIds.includes(nodeId) && governs(entry)
  );
  for (
    let selectionIndex = selectedAnnotationIds.length - 1;
    selectionIndex >= 0;
    selectionIndex -= 1
  ) {
    const selected = candidates.find(
      (entry) => entry.id === selectedAnnotationIds[selectionIndex]
    );
    if (selected) return selected;
  }
  return candidates[0] ?? null;
};
