import React, { createContext } from "react";

import { type Pane } from "tweakpane";

interface DebugUiContextType {
  enabled: boolean;
  paneRef: React.RefObject<Pane | null>;
}

export const DebugUiContext = createContext<DebugUiContextType | null>(null);

export default DebugUiContext;
