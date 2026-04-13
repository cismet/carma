import { createContext } from "react";

import type { ViewStateNavigationManagerContextValue } from "../../../core/types";
export const ViewStateNavigationManagerContext =
  createContext<ViewStateNavigationManagerContextValue | null>(null);
