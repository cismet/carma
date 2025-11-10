import React, { createContext } from "react";

interface DebugUiContextType {
  enabled: boolean;
}

export const DebugUiContext = createContext<DebugUiContextType | null>(null);

export default DebugUiContext;
