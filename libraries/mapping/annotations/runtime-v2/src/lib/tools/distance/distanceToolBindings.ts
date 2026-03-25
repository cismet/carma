import type { DistanceToolAction } from "./distanceToolActions";

export const resolveDistanceToolKeyAction = (
  event: KeyboardEvent
): DistanceToolAction | null => {
  if (event.key === "Escape") {
    return "cancelPreview";
  }

  if (event.key === "Backspace") {
    return "undoLastPoint";
  }

  return null;
};
