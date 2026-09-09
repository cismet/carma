import type {
  TilesetDescriptor,
  TilesetHierarchyPage,
} from "./tileset-hierarchy-page";

export const HIERARCHY_OPERATION = {
  load: "load",
  cancel: "cancel",
  invalidate: "invalidate",
} as const;
export const HIERARCHY_RESULT = {
  page: "page",
  document: "document",
  error: "error",
} as const;
export type HierarchyRequest =
  | {
      id: number;
      operation: typeof HIERARCHY_OPERATION.load;
      rootUrl: string;
      url: string;
      options: Omit<RequestInit, "signal">;
    }
  | { id: number; operation: typeof HIERARCHY_OPERATION.cancel }
  | {
      id: number;
      operation: typeof HIERARCHY_OPERATION.invalidate;
      url: string;
    };
export type HierarchyResponse = { id: number } & (
  | {
      kind: typeof HIERARCHY_RESULT.page;
      page: TilesetHierarchyPage;
      cached: boolean;
    }
  | { kind: typeof HIERARCHY_RESULT.document; document: TilesetDescriptor }
  | { kind: typeof HIERARCHY_RESULT.error; message: string }
);
