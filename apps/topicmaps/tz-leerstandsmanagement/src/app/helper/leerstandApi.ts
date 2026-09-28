import { gql } from "./graphql";
import { utmPoint, utmToLngLat, type Utm } from "./geo";

export interface LeerstandPhoto {
  link: string;
  beschreibung: string | null;
  artKey: number | null;
  artName: string | null;
}

export interface LeerstandProperties {
  id: number;
  zus_adressangabe: string | null;
  flaechengroesse: number | null;
  geschosse: number | null;
  rolltreppe: string | null;
  personenaufzug: string | null;
  lastenaufzug: string | null;
  nutzungsart: string | null;
  vorherige_nutzung: string | null;
  gastronomie: string | null;
  gastronomie_begruendung: string | null;
  ausstattung: string | null;
  sonstige_hinweise: string | null;
  quelle: string | null;
  link: string | null;
  verfuegbar: string | null;
  erfasser: string | null;
  erfassungsdatum: string | null;
  letzte_aenderung_nutzer: string | null;
  letzte_aenderung_zeit: string | null;
  fotos: LeerstandPhoto[];
}

export interface LeerstandFeature {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: LeerstandProperties;
}

export interface LeerstandFeatureCollection {
  type: "FeatureCollection";
  features: LeerstandFeature[];
}

interface LsInfoRow {
  id: number;
  zus_adressangabe: string | null;
  flaechengroesse: number | null;
  geschosse: number | null;
  vorherige_nutzung: string | null;
  gastronomie_begruendung: string | null;
  ausstattung: string | null;
  sonstige_hinweise: string | null;
  quelle: string | null;
  link: string | null;
  verfuegbar: string | null;
  erfasser: string | null;
  erfassungsdatum: string | null;
  letzte_aenderung_nutzer: string | null;
  letzte_aenderung_zeit: string | null;
  geo_field: { type: string; coordinates: [number, number] } | null;
  ls_nutzungsart: { name: string } | null;
  ls_gastronomie: { name: string } | null;
  rolltreppeObject: { name: string } | null;
  personenaufzugObject: { name: string } | null;
  lastenaufzugObject: { name: string } | null;
  fotosArray: {
    ls_foto: {
      link: string | null;
      beschreibung: string | null;
      ls_foto_art: { key: number; name: string } | null;
    } | null;
  }[];
}

const LIST_QUERY = `{
  ls_info(order_by: {id: asc}) {
    id
    zus_adressangabe
    flaechengroesse
    geschosse
    vorherige_nutzung
    gastronomie_begruendung
    ausstattung
    sonstige_hinweise
    quelle
    link
    verfuegbar
    erfasser
    erfassungsdatum
    letzte_aenderung_nutzer
    letzte_aenderung_zeit
    geo_field
    ls_nutzungsart { name }
    ls_gastronomie { name }
    rolltreppeObject { name }
    personenaufzugObject { name }
    lastenaufzugObject { name }
    fotosArray {
      ls_foto {
        link
        beschreibung
        ls_foto_art { key name }
      }
    }
  }
}`;

export async function loadLeerstaende(
  jwt: string
): Promise<LeerstandFeatureCollection> {
  const data = await gql<{ ls_info: LsInfoRow[] }>(jwt, LIST_QUERY);
  const features: LeerstandFeature[] = [];
  for (const row of data.ls_info) {
    if (!row.geo_field || row.geo_field.type !== "Point") continue;
    const [lng, lat] = utmToLngLat(row.geo_field.coordinates);
    features.push({
      type: "Feature",
      id: row.id,
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: row.id,
        zus_adressangabe: row.zus_adressangabe,
        flaechengroesse: row.flaechengroesse,
        geschosse: row.geschosse,
        rolltreppe: row.rolltreppeObject?.name ?? null,
        personenaufzug: row.personenaufzugObject?.name ?? null,
        lastenaufzug: row.lastenaufzugObject?.name ?? null,
        nutzungsart: row.ls_nutzungsart?.name ?? null,
        vorherige_nutzung: row.vorherige_nutzung,
        gastronomie: row.ls_gastronomie?.name ?? null,
        gastronomie_begruendung: row.gastronomie_begruendung,
        ausstattung: row.ausstattung,
        sonstige_hinweise: row.sonstige_hinweise,
        quelle: row.quelle,
        link: row.link,
        verfuegbar: row.verfuegbar,
        erfasser: row.erfasser,
        erfassungsdatum: row.erfassungsdatum,
        letzte_aenderung_nutzer: row.letzte_aenderung_nutzer,
        letzte_aenderung_zeit: row.letzte_aenderung_zeit,
        fotos: row.fotosArray
          .filter((f) => f.ls_foto?.link)
          .map((f) => ({
            link: f.ls_foto!.link!,
            beschreibung: f.ls_foto!.beschreibung,
            artKey: f.ls_foto!.ls_foto_art?.key ?? null,
            artName: f.ls_foto!.ls_foto_art?.name ?? null,
          })),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export interface NewLeerstandPhoto {
  /** public URL after upload */
  link: string;
  /** id of the ls_foto_art row */
  artId: number;
  beschreibung?: string;
}

export interface NewLeerstand {
  utm: Utm;
  zus_adressangabe?: string;
  flaechengroesse: number;
  geschosse: number;
  /** ids of ls_vorhanden rows, only when geschosse > 1 */
  rolltreppe?: number;
  personenaufzug?: number;
  lastenaufzug?: number;
  /** id of the ls_nutzungsart row */
  vorherige_nutzungsart: number;
  vorherige_nutzung?: string;
  /** id of the ls_gastronomie row */
  gastronomie: number;
  gastronomie_begruendung?: string;
  ausstattung?: string;
  sonstige_hinweise?: string;
  quelle: string;
  link?: string;
  /** ISO date (YYYY-MM-DD) or null for "unbekannt" */
  verfuegbar: string | null;
  photos: NewLeerstandPhoto[];
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** local wall-clock time without zone, as Hasura's `timestamp` expects it */
const localTimestamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
  `${pad(d.getMilliseconds(), 3)}`;

const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const INSERT_MUTATION = `mutation($objects: [ls_info_insert_input!]!) {
  insert_ls_info(objects: $objects) { affected_rows }
}`;

const FIND_BY_STAMP_QUERY = `query($user: String!, $stamp: timestamp!) {
  ls_info(where: { erfasser: { _eq: $user }, letzte_aenderung_zeit: { _eq: $stamp } }, order_by: {id: desc}, limit: 1) {
    id
  }
}`;

const FIX_ARRAY_KEY_MUTATION = `mutation($id: Int!, $tmpKey: Int!) {
  update_ls_info(where: { id: { _eq: $id } }, _set: { fotos: $id }) { affected_rows }
  update_ls_info_ls_foto(where: { ls_info_reference: { _eq: $tmpKey } }, _set: { ls_info_reference: $id }) { affected_rows }
}`;

/**
 * Stores a new Leerstand together with its photos.
 *
 * The proxy does not return the generated id (`returning` is rejected), so
 * the row is inserted with a millisecond timestamp, read back by
 * erfasser + timestamp, and the cids array key (`fotos` on ls_info,
 * `ls_info_reference` on ls_info_ls_foto) is then rewritten from a temporary
 * key to the real id, matching the cids convention array key == master id.
 */
export async function saveLeerstand(
  jwt: string,
  user: string,
  input: NewLeerstand
): Promise<number> {
  const now = new Date();
  const stamp = localTimestamp(now);
  const tmpKey = Date.now() % 2147483647;

  const object: Record<string, unknown> = {
    zus_adressangabe: input.zus_adressangabe || null,
    flaechengroesse: input.flaechengroesse,
    geschosse: input.geschosse,
    rolltreppe: input.rolltreppe ?? null,
    personenaufzug: input.personenaufzug ?? null,
    lastenaufzug: input.lastenaufzug ?? null,
    vorherige_nutzungsart: input.vorherige_nutzungsart,
    vorherige_nutzung: input.vorherige_nutzung || null,
    gastronomie: input.gastronomie,
    gastronomie_begruendung: input.gastronomie_begruendung || null,
    ausstattung: input.ausstattung || null,
    sonstige_hinweise: input.sonstige_hinweise || null,
    quelle: input.quelle,
    link: input.link || null,
    verfuegbar: input.verfuegbar,
    erfasser: user,
    erfassungsdatum: localDate(now),
    letzte_aenderung_nutzer: user,
    letzte_aenderung_zeit: stamp,
    geo_field: utmPoint(input.utm),
    fotos: tmpKey,
    fotosArray: {
      data: input.photos.map((p) => ({
        ls_foto: {
          data: {
            link: p.link,
            art: p.artId,
            beschreibung: p.beschreibung || null,
          },
        },
      })),
    },
  };

  await gql(jwt, INSERT_MUTATION, { objects: [object] });

  const found = await gql<{ ls_info: { id: number }[] }>(
    jwt,
    FIND_BY_STAMP_QUERY,
    { user, stamp }
  );
  const id = found.ls_info[0]?.id;
  if (!id) {
    throw new Error("Datensatz gespeichert, aber die neue ID wurde nicht gefunden");
  }

  await gql(jwt, FIX_ARRAY_KEY_MUTATION, { id, tmpKey });
  return id;
}
