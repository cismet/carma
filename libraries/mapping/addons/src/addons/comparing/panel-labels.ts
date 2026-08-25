import { COMPARE_MODE, type CompareMode } from "./compare-modes";

/**
 * What each panel is called, from the geometry the mode actually draws.
 *
 * Two and three panels are stripes along the mode's orientation; four is the
 * 2x2 grid, where orientation no longer says anything, so the corners name
 * themselves. The lens names its two by what they are rather than by where they
 * sit, since one of them is a circle that moves. The mode publishes these, so a
 * heading in the control pane cannot end up describing a layout that is not on
 * screen.
 */
export const panelLabelsFor = (
  panelCount: number,
  orientation: "horizontal" | "vertical",
  mode?: CompareMode
): string[] => {
  if (mode === COMPARE_MODE.spyglass) {
    return ["Umgebung", "Lupe"];
  }
  if (panelCount === 4) {
    return ["Oben links", "Oben rechts", "Unten links", "Unten rechts"];
  }
  const horizontal = ["Links", "Mitte", "Rechts"];
  const vertical = ["Oben", "Mitte", "Unten"];
  const names = orientation === "vertical" ? vertical : horizontal;
  if (panelCount === 2) {
    return [names[0], names[2]];
  }
  if (panelCount === 3) {
    return names;
  }
  return Array.from({ length: panelCount }, (_, i) => `Ansicht ${i + 1}`);
};
