import { MINUS_PI_OVER_FOUR } from "@carma-units";

export const OVERLAY_HANDLE_ID = "point-move-u-handle";
export const OPEN_GIZMO_SCENE_CLICK_GUARD_MS = 220;

// Stacking
export const MOVE_GIZMO_OVERLAY_Z_INDEX = 30;
export const AXIS_LINE_LAYER_Z_INDEX = 0;
export const DISC_LAYER_Z_INDEX = 1;
export const CENTER_HIT_LAYER_Z_INDEX = 2;
export const ARROW_LAYER_Z_INDEX = 3;

// Colours and opacity
export const ENU_UP_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
export const ENU_EAST_AXIS_COLOR = "rgba(239, 68, 68, 0.98)";
export const ENU_NORTH_AXIS_COLOR = "rgba(34, 197, 94, 0.98)";
export const SECONDARY_AXIS_COLOR = "rgba(148, 163, 184, 0.98)";
export const INACTIVE_AXIS_OPACITY = 1;
export const DISC_OUTLINE_COLOR = "rgba(255,255,255,0.92)";
export const DISC_OUTLINE_BASE_OPACITY = 0.92;
export const AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX = 1.5;

// Disc
export const DISC_SCREEN_PIXEL_RADIUS = 48;
export const DISC_SVG_EXTENT = 320;
export const DISC_SVG_HALF_EXTENT = DISC_SVG_EXTENT / 2;
export const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
export const CENTER_DRAG_HIT_AREA_PX = 40;

// Axes and arrows
export const AXIS_SCREEN_SAMPLE_TARGET_PX = 48;
export const AXIS_SCREEN_SAMPLE_MIN_WORLD = 0.25;
export const AXIS_SCREEN_SAMPLE_MAX_WORLD = 500;
export const DEFAULT_ACTIVE_ARROW_EDGE_PX = 16;
export const DEFAULT_INACTIVE_ARROW_EDGE_PX = 12;
export const ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.3;
export const INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.05;
/** Arrow edges scale with the disc's apparent radius over its target, clamped. */
export const ARROW_PERSPECTIVE_SCALE_MIN = 0.4;
export const ARROW_PERSPECTIVE_SCALE_MAX = 4;

// Plane drag cursors
export const PLANE_DRAG_GROUND_SNAP_CURSOR = "row-resize";
export const PLANE_DRAG_DISC_CURSOR = "move";

// Rotation handle
export const ROTATION_HANDLE_RADIUS_PX = 8;
export const ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD = MINUS_PI_OVER_FOUR;
export const ROTATION_HANDLE_MIN_MINOR_RADIUS_PX = 0.25;
export const ROTATION_NORMAL_SCREEN_SAMPLE_WORLD = 1;
