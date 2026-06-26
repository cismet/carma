import type {
  IconDefinition,
  IconName,
  IconPrefix,
} from "@fortawesome/fontawesome-svg-core";

// Custom FontAwesome-style icon mirroring the CSS `row-resize` cursor: a
// vertical double-headed arrow with a horizontal bar through the middle. There
// is no stock FontAwesome equivalent. Used to mark the move gizmo's disc centre,
// which moves a point to ground/surface height (cismet/wupp#4078).
//
// The artwork is three non-overlapping sub-paths (a plus/cross for the shaft and
// bar, plus an up and a down arrowhead) so it fills cleanly with any winding.
export const faRowResize: IconDefinition = {
  prefix: "fac" as IconPrefix,
  iconName: "row-resize" as IconName,
  icon: [
    512,
    512,
    [],
    "",
    "M216 140 L296 140 L296 216 L432 216 L432 296 L296 296 L296 372 L216 372 L216 296 L80 296 L80 216 L216 216 Z M256 48 L150 140 L362 140 Z M256 464 L362 372 L150 372 Z",
  ],
};

export default faRowResize;
