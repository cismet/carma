import { WIZARD_ACTIONS } from "./constants";

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
  ADMIN_DIENSTSTELLEN: "adminDienststellen",
  ADMIN_ROLLEN: "adminRollen",
  ADMIN_STRASSENFRONTEN: "adminStrassenfronten",
  ADMIN_BEMERKUNGEN: "adminBemerkungen",
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
    { id: STEP.SPLIT_CHOOSE, title: "Auswahl des Flurstücks" },
    { id: STEP.RESULTING, title: "Flurstücke anlegen" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
  [WIZARD_ACTIONS.JOIN]: [
    { id: STEP.JOIN_CHOOSE, title: "Auswahl der Flurstücke" },
    { id: STEP.RESULTING, title: "Flurstück anlegen" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
  [WIZARD_ACTIONS.SPLIT_JOIN]: [
    { id: STEP.JOIN_CHOOSE, title: "Zusammenlegen" },
    { id: STEP.SPLIT_CHOOSE, title: "Teilen" },
    { id: STEP.RESULTING, title: "Anlegen" },
    { id: STEP.SUMMARY, title: "Zusammenfassung" },
  ],
};

const ADMIN_GROUP = "Verwaltungsbereiche";

const ADMIN_STEPS = [
  { id: STEP.ADMIN_DIENSTSTELLEN, title: "Dienststellen", group: ADMIN_GROUP },
  { id: STEP.ADMIN_ROLLEN, title: "Zusätzliche Rollen", group: ADMIN_GROUP },
  {
    id: STEP.ADMIN_STRASSENFRONTEN,
    title: "Straßenfronten",
    group: ADMIN_GROUP,
  },
  { id: STEP.ADMIN_BEMERKUNGEN, title: "Bemerkungen", group: ADMIN_GROUP },
];

const COMMON_STEPS = [...ADMIN_STEPS, { id: STEP.USAGE, title: "Nutzung" }];

const SKIPPED_COMMON_STEPS = {
  [WIZARD_ACTIONS.HISTORIC]: ADMIN_STEPS.map((step) => step.id),
};

const withCommonSteps = (branch, action) => [
  ...branch,
  ...COMMON_STEPS.filter(
    (step) => !(SKIPPED_COMMON_STEPS[action] ?? []).includes(step.id)
  ),
];

export const getSteps = (action) =>
  action
    ? [INITIAL_STEP, ...withCommonSteps(BRANCHES[action], action)]
    : [INITIAL_STEP];

export const isLastStep = (action, index) =>
  action ? index === getSteps(action).length - 1 : false;
