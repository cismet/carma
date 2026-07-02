import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ObjectType } from "../../components/ui/expert-search/fieldRegistry";
import type { RootState } from "../index";

// Redux home for the expert search (Expertensuche). The filter tree (groups →
// rules) used to live in component state on a single <ExpertSearch> instance, so
// switching tabs kept showing the same rules for every object type. Keying the
// tree by ObjectType here gives each tab its own independent, persistent filter.

export type Conjunction = "UND" | "ODER";

export interface ExpertRuleState {
  id: number;
  field: string; // registry key = backend column
  operator: string; // eq | neq | contains | gt | gte | lt | lte | empty
  value: unknown;
}

export interface ExpertGroupState {
  id: number;
  conjunction: Conjunction; // how rules inside the group combine
  rules: ExpertRuleState[];
}

export interface ExpertTypeState {
  groups: ExpertGroupState[];
  groupConjunction: Conjunction; // how the groups combine
  nextGroupId: number;
  nextRuleId: number;
}

type ExpertSearchState = Record<ObjectType, ExpertTypeState>;

const OBJECT_TYPES: ObjectType[] = [
  "leuchte",
  "mast",
  "schaltstelle",
  "mauerlasche",
];

// Every tab starts with a single empty group, matching the previous default.
const createTypeState = (): ExpertTypeState => ({
  groups: [{ id: 1, conjunction: "UND", rules: [] }],
  groupConjunction: "UND",
  nextGroupId: 2,
  nextRuleId: 1,
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
      t.groups.push({ id: t.nextGroupId++, conjunction: "UND", rules: [] });
    },
    removeGroup(
      state,
      action: PayloadAction<{ objectType: ObjectType; groupId: number }>
    ) {
      const t = state[action.payload.objectType];
      t.groups = t.groups.filter((g) => g.id !== action.payload.groupId);
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
        operator: action.payload.operator ?? "contains",
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
    resetType(state, action: PayloadAction<ObjectType>) {
      state[action.payload] = createTypeState();
    },
  },
});

export default slice;

export const {
  addGroup,
  removeGroup,
  setGroupConjunction,
  setGroupInnerConjunction,
  addRule,
  removeRule,
  setRuleField,
  setRuleOperator,
  setRuleValue,
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
