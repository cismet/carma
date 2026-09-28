import { gql } from "./graphql";

export interface LookupEntry {
  id: number;
  key: number;
  name: string;
}

export interface Lookups {
  fotoArt: LookupEntry[];
  vorhanden: LookupEntry[];
  nutzungsart: LookupEntry[];
  gastronomie: LookupEntry[];
}

/** keys of ls_foto_art (seeded from wupp #4137) */
export const FOTO_ART_KEY = {
  AUSSEN: 1,
  ZUWEG_LINKS: 2,
  ZUWEG_RECHTS: 3,
  INNEN: 4,
} as const;

/** keys of ls_vorhanden */
export const VORHANDEN_KEY = { JA: 1, NEIN: 2, UNBEKANNT: 3 } as const;

/** keys of ls_gastronomie */
export const GASTRONOMIE_KEY = { JA: 1, NEIN: 2, UNKLAR: 3 } as const;

/** `quelle` is a plain text column; these are the allowed values from #4137 */
export const QUELLE_OPTIONS = [
  "Erfassung vor Ort",
  "Eigentümer*in/Verwalter*in",
  "Makler*innen-Information",
  "Internet",
  "Sonstige Quelle",
];

const LOOKUP_QUERY = `{
  ls_foto_art(order_by: {key: asc}) { id key name }
  ls_vorhanden(order_by: {key: asc}) { id key name }
  ls_nutzungsart(order_by: {key: asc}) { id key name }
  ls_gastronomie(order_by: {key: asc}) { id key name }
}`;

interface LookupResponse {
  ls_foto_art: LookupEntry[];
  ls_vorhanden: LookupEntry[];
  ls_nutzungsart: LookupEntry[];
  ls_gastronomie: LookupEntry[];
}

export async function loadLookups(jwt: string): Promise<Lookups> {
  const data = await gql<LookupResponse>(jwt, LOOKUP_QUERY);
  return {
    fotoArt: data.ls_foto_art,
    vorhanden: data.ls_vorhanden,
    nutzungsart: data.ls_nutzungsart,
    gastronomie: data.ls_gastronomie,
  };
}

export const byKey = (entries: LookupEntry[], key: number) =>
  entries.find((e) => e.key === key);

export const idOfKey = (entries: LookupEntry[], key: number): number => {
  const entry = byKey(entries, key);
  if (!entry) throw new Error(`Lookup key ${key} fehlt in der Datenbank`);
  return entry.id;
};
