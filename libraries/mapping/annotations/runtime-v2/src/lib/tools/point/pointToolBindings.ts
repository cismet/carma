import type { PointToolAction } from "./pointToolActions";

export const resolvePointToolKeyAction = (
  event: KeyboardEvent
): PointToolAction | null => {
  if (event.key === "Backspace") {
    return "removeLatestPoint";
  }

  return null;
};
