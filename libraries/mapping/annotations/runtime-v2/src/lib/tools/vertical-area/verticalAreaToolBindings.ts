import type { VerticalAreaToolAction } from "./verticalAreaToolActions";

export const resolveVerticalAreaToolKeyAction = (
  event: KeyboardEvent
): VerticalAreaToolAction | null => {
  if (event.key === "Escape") {
    return "cancelPreview";
  }

  if (event.key === "Backspace") {
    return "undoLastPoint";
  }

  return null;
};
