import { useContext } from "react";

import { LabelOverlayContext } from "./LabelOverlayContext";
import type { LabelOverlayContextType } from "./types";
export const useLabelOverlay = (): LabelOverlayContextType => {
  const context = useContext(LabelOverlayContext);
  if (context === undefined) {
    throw new Error(
      "useLabelOverlay must be used within a LabelOverlayProvider"
    );
  }
  return context;
};
