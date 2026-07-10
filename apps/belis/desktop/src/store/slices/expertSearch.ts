import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ObjectType } from "../../components/ui/expert-search/fieldRegistry";
import type { RootState } from "../index";

// Redux home for the expert search (Expertensuche). The filter tree (groups →
// rules) used to live in component state on a single <ExpertSearch> instance, so
// switching tabs kept showing the same rules for every object type. Keying the
// tree by ObjectType here gives each tab its own independent, persistent filter.

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
}

type ExpertSearchState = Record<ObjectType, ExpertTypeState>;

const OBJECT_TYPES: ObjectType[] = [
  "leuchte",
  "mast",
  "schaltstelle",
  "mauerlasche",
  "leitung",
];

// Every tab starts with a single empty group, matching the previous default.
// The limit is unset (null) by default, so no `limit` clause is emitted and all
// matching rows come back until the user enters one.
const createTypeState = (): ExpertTypeState => ({
  groups: [{ id: 1, conjunction: "UND", negated: false, rules: [] }],
  groupConjunction: "UND",
  sorts: [],
  limit: null,
  selectedGroupId: 1,
  sortSelected: false,
  nextGroupId: 2,
  nextRuleId: 1,
  nextSortId: 1,
});

const initialState: ExpertSearchState = OBJECT_TYPES.reduce((acc, type) => {
  acc[type] = createTypeState();
  return acc;
}, {} as ExpertSearchState);

const findGroup = (typeState: ExpertTypeState, groupId: number) =>
  typeState.groups.find((g) => g.id === groupId);

const findRule = (
  typeState: ExpertTypeState,
  groupId: number,
  ruleId: number
) => findGroup(typeState, groupId)?.rules.find((r) => r.id === ruleId);

const slice = createSlice({
  name: "expertSearch",
  initialState,
  reducers: {
    addGroup(state, action: PayloadAction<ObjectType>) {
      const t = state[action.payload];
      const id = t.nextGroupId++;
      t.groups.push({
        id,
        conjunction: "UND",
        negated: false,
        rules: [],
      });
      // A freshly added group becomes the target for sidebar field clicks.
      t.selectedGroupId = id;
      t.sortSelected = false;
    },
    removeGroup(
      state,
      action: PayloadAction<{ objectType: ObjectType; groupId: number }>
    ) {
      const t = state[action.payload.objectType];
      t.groups = t.groups.filter((g) => g.id !== action.payload.groupId);
      // If the selected group was removed, fall back to the last remaining one.
      if (!t.groups.some((g) => g.id === t.selectedGroupId)) {
        t.selectedGroupId = t.groups[t.groups.length - 1]?.id ?? 0;
      }
    },
    selectGroup(
      state,
      action: PayloadAction<{ objectType: ObjectType; groupId: number }>
    ) {
      const t = state[action.payload.objectType];
      t.selectedGroupId = action.payload.groupId;
      t.sortSelected = false;
    },
    selectSort(state, action: PayloadAction<ObjectType>) {
      state[action.payload].sortSelected = true;
    },
    setGroupConjunction(
      state,
      action: PayloadAction<{ objectType: ObjectType; conjunction: Conjunction }>
    ) {
      state[action.payload.objectType].groupConjunction =
        action.payload.conjunction;
    },
    setGroupInnerConjunction(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        conjunction: Conjunction;
      }>
    ) {
      const group = findGroup(
        state[action.payload.objectType],
        action.payload.groupId
      );
      if (group) group.conjunction = action.payload.conjunction;
    },
    setGroupNegated(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        negated: boolean;
      }>
    ) {
      const group = findGroup(
        state[action.payload.objectType],
        action.payload.groupId
      );
      if (group) group.negated = action.payload.negated;
    },
    addRule(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        field: string;
        operator?: string;
      }>
    ) {
      const t = state[action.payload.objectType];
      const group = findGroup(t, action.payload.groupId);
      if (!group) return;
      group.rules.push({
        id: t.nextRuleId++,
        field: action.payload.field,
        operator: action.payload.operator ?? "eq",
        value: undefined,
      });
    },
    removeRule(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        ruleId: number;
      }>
    ) {
      const group = findGroup(
        state[action.payload.objectType],
        action.payload.groupId
      );
      if (group) {
        group.rules = group.rules.filter((r) => r.id !== action.payload.ruleId);
      }
    },
    setRuleField(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        ruleId: number;
        field: string;
      }>
    ) {
      const rule = findRule(
        state[action.payload.objectType],
        action.payload.groupId,
        action.payload.ruleId
      );
      if (rule) {
        rule.field = action.payload.field;
        // The input type may change with the field, so drop the stale value.
        rule.value = undefined;
      }
    },
    setRuleOperator(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        ruleId: number;
        operator: string;
      }>
    ) {
      const rule = findRule(
        state[action.payload.objectType],
        action.payload.groupId,
        action.payload.ruleId
      );
      if (rule) rule.operator = action.payload.operator;
    },
    setRuleValue(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        groupId: number;
        ruleId: number;
        value: unknown;
      }>
    ) {
      const rule = findRule(
        state[action.payload.objectType],
        action.payload.groupId,
        action.payload.ruleId
      );
      if (rule) rule.value = action.payload.value;
    },
    addSort(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        field: string;
        direction?: SortDirection;
      }>
    ) {
      const t = state[action.payload.objectType];
      t.sorts.push({
        id: t.nextSortId++,
        field: action.payload.field,
        direction: action.payload.direction ?? "asc",
      });
      // Adding a sort makes the sort list the target for sidebar field clicks.
      t.sortSelected = true;
    },
    removeSort(
      state,
      action: PayloadAction<{ objectType: ObjectType; sortId: number }>
    ) {
      const t = state[action.payload.objectType];
      t.sorts = t.sorts.filter((s) => s.id !== action.payload.sortId);
      // Nothing left to sort → drop back out of sort-select mode.
      if (t.sorts.length === 0) t.sortSelected = false;
    },
    setSortField(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        sortId: number;
        field: string;
      }>
    ) {
      const sort = state[action.payload.objectType].sorts.find(
        (s) => s.id === action.payload.sortId
      );
      if (sort) sort.field = action.payload.field;
    },
    setSortDirection(
      state,
      action: PayloadAction<{
        objectType: ObjectType;
        sortId: number;
        direction: SortDirection;
      }>
    ) {
      const sort = state[action.payload.objectType].sorts.find(
        (s) => s.id === action.payload.sortId
      );
      if (sort) sort.direction = action.payload.direction;
    },
    setLimit(
      state,
      action: PayloadAction<{ objectType: ObjectType; limit: number | null }>
    ) {
      state[action.payload.objectType].limit = action.payload.limit;
    },
    resetType(state, action: PayloadAction<ObjectType>) {
      state[action.payload] = createTypeState();
    },
  },
});

export default slice;

export const {
  addGroup,
  removeGroup,
  selectGroup,
  selectSort,
  setGroupConjunction,
  setGroupInnerConjunction,
  setGroupNegated,
  addRule,
  removeRule,
  setRuleField,
  setRuleOperator,
  setRuleValue,
  addSort,
  removeSort,
  setSortField,
  setSortDirection,
  setLimit,
  resetType,
} = slice.actions;

export const getExpertTypeState =
  (objectType: ObjectType) =>
  (state: RootState): ExpertTypeState =>
    state.expertSearch[objectType];

// A rule is complete when its value is filled — except "ist leer" (empty),
// which needs no value. 0 / false count as filled.
export const isRuleComplete = (rule: ExpertRuleState): boolean =>
  rule.operator === "empty" ||
  !(rule.value === undefined || rule.value === null || rule.value === "");

// True when the tab has at least one rule still missing its value.
export const getExpertTypeHasIncompleteRule =
  (objectType: ObjectType) =>
  (state: RootState): boolean =>
    state.expertSearch[objectType].groups.some((group) =>
      group.rules.some((rule) => !isRuleComplete(rule))
    );
