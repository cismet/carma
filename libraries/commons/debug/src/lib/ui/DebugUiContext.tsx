import React, { createContext } from "react";

import { type Pane } from "tweakpane";

interface DebugUiContextType {
  paneRef: React.RefObject<Pane | null>;
}

export const DebugUiContext = createContext<DebugUiContextType | null>(null);

export default DebugUiContext;
