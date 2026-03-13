import { useLineLabelVisualizers } from "./useLineLabelVisualizers";
import { useLineSegmentVisualizers } from "./useLineSegmentVisualizers";
import type { LineVisualizerData } from "./lineVisualizers.types";

export type { LineVisualizerData } from "./lineVisualizers.types";

export const useLineVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  useLineSegmentVisualizers(lines, showLines);
  useLineLabelVisualizers(lines, showLines);
};
