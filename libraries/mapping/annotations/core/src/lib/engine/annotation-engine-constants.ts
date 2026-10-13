/** Value vocabularies of the engine contract (`AnnotationEngine`). */

export const ANNOTATION_ENGINE_KINDS = {
  CESIUM: "cesium",
  MAPLIBRE_THREE: "maplibre-three",
} as const;

export type AnnotationEngineKind =
  (typeof ANNOTATION_ENGINE_KINDS)[keyof typeof ANNOTATION_ENGINE_KINDS];

export const ANNOTATION_RING_MATERIAL_PRESETS = {
  COLOR: "color",
  CHROME_MIRROR: "chrome-mirror",
  FROSTED_GLASS: "frosted-glass",
} as const;

export type AnnotationRingMaterialPreset =
  (typeof ANNOTATION_RING_MATERIAL_PRESETS)[keyof typeof ANNOTATION_RING_MATERIAL_PRESETS];

export const ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT = {
  GROUND: "ground",
  COPLANAR: "coplanar",
} as const;

export type AnnotationScenePolygonFillPlacement =
  (typeof ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT)[keyof typeof ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT];

export const ANNOTATION_POINT_QUERY_CLICK_STRATEGY = {
  IMMEDIATE: "immediate",
  DELAYED_LINE_FINISH: "delayed-line-finish",
} as const;

export type AnnotationPointQueryClickStrategy =
  (typeof ANNOTATION_POINT_QUERY_CLICK_STRATEGY)[keyof typeof ANNOTATION_POINT_QUERY_CLICK_STRATEGY];

export const ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS = {
  SHIFT: "shift",
} as const;

export type AnnotationEnginePointQueryInputModifier =
  (typeof ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS)[keyof typeof ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS];

export const ANNOTATION_GIZMO_DISC_SCALING_MODES = {
  SCREEN: "screen",
  WORLD: "world",
} as const;

export type AnnotationGizmoDiscScalingMode =
  (typeof ANNOTATION_GIZMO_DISC_SCALING_MODES)[keyof typeof ANNOTATION_GIZMO_DISC_SCALING_MODES];
