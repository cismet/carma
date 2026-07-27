import type {
  GroupToolDefinition,
  GroupToolEntry,
} from "../lib/contracts/carma-layers.d";

export const normalizeGroupTools = (
  tools?: GroupToolEntry[]
): GroupToolDefinition[] =>
  (tools ?? []).map((tool) =>
    typeof tool === "string" ? { type: tool } : tool
  );
