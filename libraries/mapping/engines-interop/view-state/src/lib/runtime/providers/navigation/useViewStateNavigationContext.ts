import { useContext } from "react";
import type { ViewStateNavigationManagerContextValue } from "../../../core/types";
import { ViewStateNavigationManagerContext } from "./ViewStateNavigationManagerContext";

export const useViewStateNavigationContext =
  (): ViewStateNavigationManagerContextValue => {
    const ctx = useContext(ViewStateNavigationManagerContext);
    if (!ctx) {
      throw new Error(
        "Navigation hooks require a <ViewStateNavigationManagerProvider> ancestor."
      );
    }
    return ctx;
  };
