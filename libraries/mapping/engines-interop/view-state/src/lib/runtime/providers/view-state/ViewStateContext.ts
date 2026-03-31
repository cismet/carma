import { createContext } from "react";
import type { ViewStateContextValue } from "../../../core/types";

export const ViewStateContext = createContext<ViewStateContextValue | null>(
  null
);
