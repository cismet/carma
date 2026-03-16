import { createContext } from "react";
import type { ViewSyncStore } from "../core/types";

export const ViewSyncStoreContext = createContext<ViewSyncStore | null>(null);
