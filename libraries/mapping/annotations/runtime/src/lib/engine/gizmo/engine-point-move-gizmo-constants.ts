import { AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX } from "@carma-mapping/gizmo/core";

// Runtime-only gizmo constants; shared ones live in @carma-mapping/gizmo/core.
export const DISC_FILL_COLOR = "#ffffff";
export const DISC_FILL_OPACITY = 0.5;
export const AXIS_LINE_COLOR = "#ffffff";
/** The move axis between the arrows, in the overlay and in the scene. */
export const AXIS_LINE_FILL = "rgba(255,255,255,0.82)";
export const CONE_ARROW_RIM_STROKE_OPACITY = 0.7;
export const CONE_ARROW_BOX_PADDING_PX =
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX + 1;
/** The dot on an arrow's tip: the colour and the width of the arrow's outline. */
export const ARROW_TIP_DOT_RADIUS_PX =
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX / 2;
export const ARROW_TIP_DOT_FILL = "rgba(255, 255, 255, 0.95)";
export const ARROW_OUTLINE_STROKE = "rgba(255, 255, 255, 0.95)";
