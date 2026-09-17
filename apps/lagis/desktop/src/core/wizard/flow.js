import { WIZARD_ACTIONS } from "./constants";

/**
 * The step ids and captions of each branch, taken from the WizardPanelProvider
 * constructors of the Swing wizard.
 */
export const STEP = {
  CHOOSE_ACTION: "chooseAction",
  CREATE: "create",
  RENAME: "rename",
  HISTORIC: "historic",
  ACTIVATE: "activate",
  CHANGE_KIND: "changeKind",
  SPLIT_CHOOSE: "splitChoose",
  JOIN_CHOOSE: "joinChoose",
  RESULTING: "resulting",
  SUMMARY: "summary",
  ADMIN_AREAS: "adminAreas",
  USAGE: "usage",
};

const INITIAL_STEP = { id: STEP.CHOOSE_ACTION, title: "Aktion wählen" };

const BRANCHES = {
  [WIZARD_ACTIONS.CREATE]: [{ id: STEP.CREATE, title: "Flurstück auswählen" }],
  [WIZARD_ACTIONS.RENAME]: [{ id: STEP.RENAME, title: "Flurstück auswählen" }],
  [WIZARD_ACTIONS.HISTORIC]: [
    { id: STEP.HISTORIC, title: "Flurstück auswählen" },
  ],
  [WIZARD_ACTIONS.ACTIVATE]: [
    { id: STEP.ACTIVATE, title: "Flurstück auswählen" },
  ],
  [WIZARD_ACTIONS.CHANGE_KIND]: [
    { id: STEP.CHANGE_KIND, title: "Flurstück auswählen" },
  ],
  [WIZARD_ACTIONS.SPLIT]: [
    { id: STEP.SPLIT_CHOOSE, title: "Teilung" },
    { id: STEP.RESULTING, title: "Ergebnis" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
  [WIZARD_ACTIONS.JOIN]: [
    { id: STEP.JOIN_CHOOSE, title: "Zusammenlegen" },
    { id: STEP.RESULTING, title: "Ergebnis" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
  [WIZARD_ACTIONS.SPLIT_JOIN]: [
    { id: STEP.JOIN_CHOOSE, title: "Zusammenlegen" },
    { id: STEP.SPLIT_CHOOSE, title: "Teilen" },
    { id: STEP.RESULTING, title: "Ergebnis" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
};

/** Asked for every action, after the parcels are settled and before the summary. */
const COMMON_STEPS = [
  { id: STEP.ADMIN_AREAS, title: "Verwaltungsbereiche" },
  { id: STEP.USAGE, title: "Nutzung" },
];

const withCommonSteps = (branch) => {
  const summary = branch.findIndex((step) => step.id === STEP.SUMMARY);
  return summary === -1
    ? [...branch, ...COMMON_STEPS]
    : [...branch.slice(0, summary), ...COMMON_STEPS, ...branch.slice(summary)];
};

/** Step 0 is always the action chooser; the rest depends on what was picked. */
export const getSteps = (action) =>
  action
    ? [INITIAL_STEP, ...withCommonSteps(BRANCHES[action])]
    : [INITIAL_STEP];

/** True once the current step is the last one of the branch. */
export const isLastStep = (action, index) =>
  action ? index === getSteps(action).length - 1 : false;
