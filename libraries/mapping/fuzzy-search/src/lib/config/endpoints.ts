export enum ENDPOINT {
  ADRESSEN = "adressen",
  AENDERUNGSV = "aenderungsv",
  BEZIRKE = "bezirke",
  BPKLIMASTANDORTE = "bpklimastandorte",
  BPLAENE = "bplaene",
  EBIKES = "ebikes",
  EMOB = "emob",
  GEPS = "geps",
  GEPS_REVERSE = "geps_reverse",
  KITAS = "kitas",
  PRBR = "prbr",
  NO2 = "no2",
  QUARTIERE = "quartiere",
  POIS = "pois",
}

export type NamedCategory = Record<ENDPOINT, string>;

export const NAMED_CATEGORIES: Partial<NamedCategory> = Object.freeze({
  [ENDPOINT.POIS]: "POIS",
  [ENDPOINT.BPKLIMASTANDORTE]: "Klimastandorte",
  [ENDPOINT.KITAS]: "Kitas",
  [ENDPOINT.BEZIRKE]: "Bezirke",
  [ENDPOINT.QUARTIERE]: "Quartiere",
  [ENDPOINT.ADRESSEN]: "Adressen",
  // todo to be confirmed
  /*
    aenderungsv: "Änderungsverfahren",
    bplaene: "Bebauungs-Pläne",
    emob: "Elektromobilität",
    ebikes: "E-Bikes",
    geps: "GEPS",
    geps_reverse: "GEPS",
    prbr: "PR BR",
    no2: "NO2",
    */
});

// add default endpoints here
export const DEFAULT_GAZ_SOURCES: ENDPOINT[] = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];

export default ENDPOINT;
