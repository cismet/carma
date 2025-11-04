import { useContext } from "react";
import { CesiumContext } from "../CesiumContext";
import type { CesiumContextType } from "../CesiumContext";
import { assertWindowCesiumEnv } from "../utils/cesiumEnv";

export function useCesiumContext(): CesiumContextType {
  assertWindowCesiumEnv();
  const context = useContext(CesiumContext);
  if (!context) {
    throw new Error(
      "useCesiumContext must be used within a CesiumContextProvider"
    );
  }
  return context;
}

export function useCesiumContextOptional(): CesiumContextType | undefined {
  assertWindowCesiumEnv();
  const context = useContext(CesiumContext);
  if (!context) {
    // if throwing is disabled this is intentional and not an error or warning
    console.debug("useCesiumContext: no context available");
    return undefined;
  }
  return context;
}

export default useCesiumContext;
