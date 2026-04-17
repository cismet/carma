import type { ArbeitsauftragTileFeature } from "../store/slices/arbeitsauftraege";

export type AASortField =
  | "angelegt_am"
  | "nummer"
  | "total_protokolle"
  | "team"
  | "angelegt_von"
  | "pct_erledigt";

export type AASortDirection = "asc" | "desc";

export interface AASortConfig {
  field: AASortField;
  direction: AASortDirection;
}

export const AA_DEFAULT_SORT: AASortConfig = { field: "angelegt_am", direction: "desc" };
export const AA_SORT_BY_DATE_DESC: AASortConfig = { field: "angelegt_am", direction: "desc" };
export const AA_SORT_BY_DATE_ASC: AASortConfig = { field: "angelegt_am", direction: "asc" };
export const AA_SORT_BY_NUMMER_ASC: AASortConfig = { field: "nummer", direction: "asc" };
export const AA_SORT_BY_NUMMER_DESC: AASortConfig = { field: "nummer", direction: "desc" };
export const AA_SORT_BY_PROTOKOLLE_DESC: AASortConfig = { field: "total_protokolle", direction: "desc" };
export const AA_SORT_BY_PROTOKOLLE_ASC: AASortConfig = { field: "total_protokolle", direction: "asc" };
export const AA_SORT_BY_TEAM_ASC: AASortConfig = { field: "team", direction: "asc" };
export const AA_SORT_BY_ERLEDIGT_DESC: AASortConfig = { field: "pct_erledigt", direction: "desc" };

export function sortAAFeatures(
  features: ArbeitsauftragTileFeature[],
  config: AASortConfig
): ArbeitsauftragTileFeature[] {
  const { field, direction } = config;
  const dir = direction === "asc" ? 1 : -1;
  return [...features].sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    if (va == null && vb == null) return 0;
    if (va == null) return dir;
    if (vb == null) return -dir;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "de") * dir;
  });
}
