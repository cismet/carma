import { createContext } from "react";

import type { LabelOverlayContextType } from "./types";

export const LabelOverlayContext = createContext<
  LabelOverlayContextType | undefined
>(undefined);
