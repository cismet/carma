export type Conjunction = "UND" | "ODER";

export type SortDirection = "asc" | "desc";

export interface ExpertRuleState {
  id: number;
  field: string; // registry key = backend column
  operator: string; // eq | neq | contains | gt | gte | lt | lte | empty
  value: unknown;
}

export interface ExpertGroupState {
  id: number;
  conjunction: Conjunction; // how rules inside the group combine
  negated: boolean; // wrap the whole group in Hasura `_not` when true
  rules: ExpertRuleState[];
}

export interface ExpertSortState {
  id: number;
  field: string; // registry key = backend column to order by
  direction: SortDirection;
}

export interface ExpertTypeState {
  groups: ExpertGroupState[];
  groupConjunction: Conjunction; // how the groups combine
  sorts: ExpertSortState[]; // order_by list (first entry = primary sort)
  limit: number | null; // max rows; null = no limit
  selectedGroupId: number; // clicking a field adds its rule to this group
  sortSelected: boolean; // when true, clicking a field adds a sort instead
  nextGroupId: number;
  nextRuleId: number;
  nextSortId: number;
  savedSearchId?: number | null; // gespeicherte_suche row last loaded or saved
}

// What gets stored in gespeicherte_suche.definition.
export interface SavedSearchDefinition {
  version: 1;
  groups: ExpertGroupState[];
  groupConjunction: Conjunction;
  sorts: ExpertSortState[];
  limit: number | null;
}
