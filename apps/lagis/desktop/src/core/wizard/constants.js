// Ported from de.cismet.lagis.wizard.steps.InitialStep and
// de.cismet.lagisEE.entity.core.hardwired.FlurstueckArt

export const WIZARD_ACTIONS = {
  CREATE: "create",
  RENAME: "rename",
  HISTORIC: "historic",
  ACTIVATE: "activate",
  SPLIT: "split",
  JOIN: "join",
  SPLIT_JOIN: "split/join",
  CHANGE_KIND: "changeKind",
};

// Order and wording follow the Swing ChoiceActionPanel.
export const ACTION_CHOICES = [
  {
    value: WIZARD_ACTIONS.CREATE,
    label: "Flurstück einpflegen",
    description: "Ein neues Flurstück in LagIS aufnehmen",
  },
  {
    value: WIZARD_ACTIONS.RENAME,
    label: "Flurstück umbenennen",
    description: "Die Bezeichnung eines Flurstücks ändern",
  },
  {
    value: WIZARD_ACTIONS.HISTORIC,
    label: "Flurstück historisch setzen",
    description: "Ein Flurstück zum Stichtag historisch setzen",
  },
  {
    value: WIZARD_ACTIONS.ACTIVATE,
    label: "Flurstück aktivieren",
    description: "Ein historisches Flurstück wieder aktivieren",
  },
  {
    value: WIZARD_ACTIONS.SPLIT,
    label: "Flurstück teilen",
    description: "Ein Flurstück in mehrere Flurstücke aufteilen",
  },
  {
    value: WIZARD_ACTIONS.JOIN,
    label: "Flurstück zusammenlegen",
    description: "Mehrere Flurstücke zu einem zusammenlegen",
  },
  {
    value: WIZARD_ACTIONS.SPLIT_JOIN,
    label: "Flurstück zusammenlegen/teilen",
    description: "Zusammenlegen und das Ergebnis anschließend teilen",
  },
  {
    value: WIZARD_ACTIONS.CHANGE_KIND,
    label: "Art des Flurstücks ändern",
    description: "Die Flurstücksart des Flurstücks wechseln",
  },
];

export const ACTION_TITLES = {
  [WIZARD_ACTIONS.CREATE]: "Flurstück anlegen...",
  [WIZARD_ACTIONS.RENAME]: "Flurstück umbenennen...",
  [WIZARD_ACTIONS.HISTORIC]: "Flurstück historisch setzen...",
  [WIZARD_ACTIONS.ACTIVATE]: "Flurstück aktivieren...",
  [WIZARD_ACTIONS.SPLIT]: "Flurstück teilen...",
  [WIZARD_ACTIONS.JOIN]: "Flurstücke zusammenlegen...",
  [WIZARD_ACTIONS.SPLIT_JOIN]: "Flurstücke zusammenlegen/teilen...",
  [WIZARD_ACTIONS.CHANGE_KIND]: "Flurstückart ändern...",
};

export const FLURSTUECK_ART = {
  STAEDTISCH: "städtisch",
  ABTEILUNG_IX: "Abteilung IX",
  PSEUDO: "pseudo",
};

// ResultingPanel/SummaryPanel warn below this size.
export const SMALL_AREA_THRESHOLD_SQM = 2;

export const MIN_SPLIT_COUNT = 2;
export const MAX_SPLIT_COUNT = 100;
