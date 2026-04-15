import type { PointToolAction } from "./point-tool-actions";

export const resolvePointToolKeyAction = (
  event: KeyboardEvent
): PointToolAction | null => {
  if (event.key === "Backspace") {
    return "removeLatestPoint";
  }

  return null;
};
