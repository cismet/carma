import { FLURSTUECK_ART, WIZARD_ACTIONS } from "./constants";

const GEMARKUNG = { id: 3001, bezeichnung: "Barmen" };
const STAEDTISCH = { id: 1, bezeichnung: FLURSTUECK_ART.STAEDTISCH };

const key = (id, zaehler, nenner) => ({
  id,
  gemarkung: GEMARKUNG,
  flur: 1,
  zaehler,
  nenner,
  art: STAEDTISCH,
});

export const TEST_NUTZUNG_STAMMDATEN = {
  anlageklassen: [
    { id: 1, bezeichnung: "Grünflächen" },
    { id: 2, bezeichnung: "Straßen und Wege" },
    { id: 3, bezeichnung: "Bebaute Grundstücke" },
  ],
  nutzungsarten: [
    { id: 11, schluessel: "100", bezeichnung: "Park" },
    { id: 12, schluessel: "200", bezeichnung: "Gehweg" },
    { id: 13, schluessel: "300", bezeichnung: "Wohnbebauung" },
  ],
};

const row = (
  id,
  anlageklasseId,
  nutzungsartId,
  flaeche,
  quadratmeterpreis
) => ({
  id,
  anlageklasseId,
  nutzungsartId,
  flaeche,
  quadratmeterpreis,
});

const RESULT_A = key(undefined, 100, 1);
const RESULT_B = key(undefined, 100, 2);

export const TEST_ADMIN_STAMMDATEN = {
  dienststellen: [
    {
      id: 1,
      abkuerzung_abteilung: "102",
      bezeichnung_abteilung: "Vermessung",
      ressort: { abkuerzung: "R1" },
      farbeArrayRelationShip: [{ rgb_farbwert: 3381759 }],
    },
    {
      id: 2,
      abkuerzung_abteilung: "104",
      bezeichnung_abteilung: "Grünflächen",
      ressort: { abkuerzung: "R2" },
      farbeArrayRelationShip: [{ rgb_farbwert: 52224 }],
    },
  ],
  rolleArten: [{ id: 1, name: "Nutzer" }],
};

const admin = (id, area, dienststelleId) => ({
  area,
  dienststellen: [{ id: `${id}-d`, dienststelleId, flaeche: area }],
  rollen: [{ id: `${id}-r`, dienststelleId: 2, rolleArtId: 1 }],
  bemerkung: `Testdaten ${id}`,
  sperre: false,
  sperreBemerkung: "",
});

// the split result deliberately misses 50 m² Grünflächen and adds a new
// Anlageklasse, so the stats show a loss, a gain and an unchanged class
export const TEST_WIZARD_DATA = {
  action: WIZARD_ACTIONS.SPLIT,
  splitKey: key(-1, 100, 0),
  splitCount: 2,
  resultKeys: [RESULT_A, RESULT_B],
  admin: {
    "Barmen 1 100/1": admin("a", 600, 1),
    "Barmen 1 100/2": admin("b", 400, 2),
  },
  areaCheck: {
    targets: [{ label: "Barmen 1 100", area: 1000 }],
    results: [
      { label: "Barmen 1 100/1", area: 600 },
      { label: "Barmen 1 100/2", area: 400 },
    ],
    difference: 0,
    hasSmallArea: false,
  },
  sourceUsageFor: "-1",
  sourceUsage: [
    row("s1", 1, 11, 500, 10),
    row("s2", 2, 12, 300, 25),
    row("s3", 2, 12, 200, 25),
  ],
  usage: {
    "Barmen 1 100/1": [row("a1", 1, 11, 300, 10), row("a2", 2, 12, 300, 25)],
    "Barmen 1 100/2": [
      row("b1", 1, 11, 150, 10),
      row("b2", 2, 12, 200, 25),
      row("b3", 3, 13, 50, 120),
    ],
  },
};
