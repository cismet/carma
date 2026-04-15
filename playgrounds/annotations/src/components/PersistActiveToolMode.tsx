import { useEffect } from "react";

import { useTools } from "@carma-mapping/annotations/runtime-prototype";

import { ACTIVE_TOOL_STORAGE_KEY } from "../playgroundConfig";
export const PersistActiveToolMode = () => {
  const tools = useTools();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        ACTIVE_TOOL_STORAGE_KEY,
        tools.activeToolType
      );
    } catch {
      // ignore storage write errors
    }
  }, [tools.activeToolType]);

  return null;
};
