import type { PolylineToolAction } from "./polylineToolActions";

export const resolvePolylineToolKeyAction = (
  event: KeyboardEvent
): PolylineToolAction | null => {
  if (event.key === "Escape") {
    return "cancelPreview";
  }

  return null;
};
