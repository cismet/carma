import proj4 from "proj4";
import { proj4crs4326def } from "@carma-mapping/utils";

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const featureTypeToSourceLayer: Record<string, string> = {
  leuchte: "leuchten",
  standort: "standorte",
  leitung: "leitungen",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlaschen",
  abzweigdose: "abzweigdosen",
};

const featureTypeToGraphqlKey: Record<string, string> = {
  leuchte: "tdta_leuchten",
  standort: "tdta_standort_mast",
  leitung: "leitung",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlasche",
  abzweigdose: "abzweigdose",
};

const creationLabels: Record<string, string> = {
  leuchte: "Neue Leuchte",
  standort: "Neuer Standort",
  leitung: "Neue Leitung",
  schaltstelle: "Neue Schaltstelle",
  mauerlasche: "Neue Mauerlasche",
  abzweigdose: "Neue Abzweigdose",
};

export function convertGeometryToWgs84(
  geom: GeoJSON.Geometry
): GeoJSON.Geometry | undefined {
  if (geom.type === "Point") {
    const [lng, lat] = proj4(
      proj4crs25832def,
      proj4crs4326def,
      geom.coordinates as [number, number]
    );
    return { type: "Point", coordinates: [lng, lat] };
  }
  if (geom.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geom.coordinates.map(
        (c) =>
          proj4(
            proj4crs25832def,
            proj4crs4326def,
            c as [number, number]
          ) as [number, number]
      ),
    };
  }
  return undefined;
}

// Coerce feature properties to plain JSON values. The draft form stores date
// fields as live dayjs objects; MapLibre's web-worker serializer rejects
// non-plain objects (class instances), so pushing a feature whose properties
// contain a dayjs into a GeoJSON source silently breaks the source and freezes
// the map. Round-tripping through JSON drops that risk: dayjs.toJSON() yields
// an ISO string, and functions/undefined are stripped.
function toJsonSafeProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
  } catch {
    return props;
  }
}

export function buildSyntheticFeature(
  featureType: string,
  draftKey: string,
  values: Record<string, unknown>,
  geometryEpsg25832?: GeoJSON.Geometry
) {
  const sourceLayer = featureTypeToSourceLayer[featureType] ?? featureType;
  const wgs84Geometry = geometryEpsg25832
    ? convertGeometryToWgs84(geometryEpsg25832)
    : undefined;

  return {
    type: "Feature" as const,
    id: draftKey,
    properties: toJsonSafeProps({
      id: draftKey,
      _isCreation: true,
      _featureType: featureType,
      _creationLabel: creationLabels[featureType] ?? `Neu: ${featureType}`,
      // The brandnew style's per-type render layers filter on
      // properties._sourceLayer; setting it here lets the draft preview
      // piggy-back on the existing per-type styling.
      _sourceLayer: sourceLayer,
      ...values,
    }),
    geometry: wgs84Geometry ?? null,
    sourceLayer,
    source: "",
    layer: { id: sourceLayer, source: "", type: "circle" as const },
    state: {},
  };
}

// Resolve a foreign-key id against a key table, returning the matched row.
// Used to denormalize draft form values (which store FK ids) into the flat
// props the vector-tile style and the sidebar extractors expect.
function resolveRow(
  fk: unknown,
  keyTable: unknown
): Record<string, unknown> | undefined {
  if (fk == null) return undefined;
  const id = Number(fk);
  if (!Number.isFinite(id)) return undefined;
  const rows = keyTable as Array<Record<string, unknown>> | undefined;
  return rows?.find((t) => Number(t.id) === id);
}

// Convenience wrapper: resolve an FK and return just the row's `bezeichnung`.
function resolveBezeichnung(
  fk: unknown,
  keyTable: unknown
): string | undefined {
  const bezeichnung = resolveRow(fk, keyTable)?.bezeichnung;
  return typeof bezeichnung === "string" ? bezeichnung : undefined;
}

// Declarative connector between the draft-form data shape and the flat-prop
// shape the vector-tile style + sidebar list-item extractors read. Each rule
// resolves a foreign-key id (`fk`) against a key table (`table`) and writes
// the matched row's `bezeichnung` into the flat prop (`target`).
//
// Supporting a new feature type is normally one row here — no new code. The
// label-building logic stays solely in the extractors (BelisSidebar.tsx).
interface FkDenormRule {
  fk: string;
  table: string;
  target: string;
}

const draftDenormRules: Record<string, FkDenormRule[]> = {
  leitung: [
    { fk: "fk_leitungstyp", table: "leitungstyp", target: "bezeichnung" },
  ],
  schaltstelle: [{ fk: "fk_bauart", table: "bauart", target: "bauart" }],
  mauerlasche: [
    { fk: "fk_material", table: "materialMauerlasche", target: "material" },
  ],
};

// Mirror the denormalized properties the vector-tile style and the sidebar
// list-item extractors read, so a synthetic draft renders with the same
// per-type styling and label text as the real tile features. The forms store
// foreign keys as ids (`fk_*`); the style/extractors expect flat strings.
// Extend `draftDenormRules` above for FK-backed props; add a special case
// below only for non-FK derived props (e.g. a computed count).
export function enrichSyntheticProps(
  featureType: string,
  values: Record<string, unknown>,
  keyTables: Record<string, unknown> = {},
  // Existing Bestand Leuchten on the parent Standort, for the icon dot count.
  // Stored on the draft (seeded from the tile property, refreshed once the
  // mast fetch resolves); 0 when there is no linked Standort.
  bestandLeuchtenCount = 0
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };

  // Generic: every form picking a Strassenschluessel stores the resolved
  // street as `strassenschluessel_strasse`; extractors read `strasse`.
  if (out.strasse == null && values.strassenschluessel_strasse) {
    out.strasse = values.strassenschluessel_strasse;
  }

  // Generic: resolve each FK id declared for this feature type.
  for (const rule of draftDenormRules[featureType] ?? []) {
    const bezeichnung = resolveBezeichnung(
      values[rule.fk],
      keyTables[rule.table]
    );
    if (bezeichnung) out[rule.target] = bezeichnung;
  }

  // Special case: Standort. The Mast key tables expose their label under
  // `mastart` / `masttyp` (not `bezeichnung`), so the generic FK rules can't
  // reach them — these are exactly the props the info-box mapping reads for
  // the Standort branch (`header` = mastart). That branch also requires
  // `lfd_nummer` to be defined; a fresh draft has none (assigned on save), so
  // default it to "" — the branch is then entered and the title renders as
  // "Mast - ?", consistent with how other draft types show an unknown id.
  if (featureType === "standort") {
    const mastartRow = resolveRow(values.fk_mastart, keyTables.mastart);
    if (mastartRow?.mastart != null) out.mastart = mastartRow.mastart;
    const masttypRow = resolveRow(values.fk_masttyp, keyTables.masttyp);
    if (masttypRow?.masttyp != null) out.masttyp = masttypRow.masttyp;
    if (out.lfd_nummer == null) out.lfd_nummer = "";
    // A Standort creation draft can carry in-progress Leuchten under
    // `values.leuchten[]` (the "+ Leuchte" tabs). Surface their count so the
    // brandnew `standorte` icon renders the right number of dots, and drop the
    // array itself from the flat props — it's not a styling/label input and
    // would only bloat the JSON-serialized feature.
    const extras = values.leuchten as Array<unknown> | undefined;
    if (Array.isArray(extras) && extras.length > 0) {
      out.leuchten_count = extras.length;
    }
    delete out.leuchten;
  }

  // Special case: Leuchte data is tab-grouped (`values.leuchte` / `values.mast`),
  // so the flat denorm rules above can't reach it. Flatten the props the
  // `leuchten` sidebar/header extractor reads (`leuchtentyp`, `leuchtennummer`,
  // `lfd_nummer`, `fabrikat`, `strasse`), plus the icon-layer count.
  if (featureType === "leuchte") {
    const leuchte = (values.leuchte ?? {}) as Record<string, unknown>;
    const mast = (values.mast ?? {}) as Record<string, unknown>;

    // Leuchtentyp + Fabrikat: the form stores an FK id; the extractor reads
    // the flat `leuchtentyp` / `fabrikat` strings off the leuchtentyp table.
    const leuchttypRow = resolveRow(leuchte.fk_leuchttyp, keyTables.leuchtentyp);
    if (leuchttypRow?.leuchtentyp != null) {
      out.leuchtentyp = leuchttypRow.leuchtentyp;
    }
    if (leuchttypRow?.fabrikat != null) out.fabrikat = leuchttypRow.fabrikat;

    // Masttyp / Mastart feed the info box's additional-info line
    // ("Masttyp / Mastart"); the form stores them as FK ids on the Mast tab.
    const mastartRow = resolveRow(mast.fk_mastart, keyTables.mastart);
    if (mastartRow?.mastart != null) out.mastart = mastartRow.mastart;
    const masttypRow = resolveRow(mast.fk_masttyp, keyTables.masttyp);
    if (masttypRow?.masttyp != null) out.masttyp = masttypRow.masttyp;

    // Leuchtennummer and the parent Standort's running number — read flat by
    // the extractor to build `${typ}-${nr}, ${lfd}`.
    if (leuchte.leuchtennummer != null) {
      out.leuchtennummer = leuchte.leuchtennummer;
    }
    if (mast.lfd_nummer != null) out.lfd_nummer = mast.lfd_nummer;

    // The Strassenschluessel lives on the Mast tab for Leuchten.
    if (out.strasse == null && mast.strassenschluessel_strasse != null) {
      out.strasse = mast.strassenschluessel_strasse;
    }

    // Icon layer keys on a computed count: the parent Standort's existing
    // Bestand Leuchten + the editable "Leuchte 1" slice + each extra tab
    // persisted under `values.leuchten`. Without the bestand term the icon
    // would shrink from N dots (real Standort) to 1 dot the moment a draft
    // opens on top of it.
    const extras = values.leuchten as Array<unknown> | undefined;
    out.leuchten_count =
      bestandLeuchtenCount + 1 + (Array.isArray(extras) ? extras.length : 0);
  }

  return out;
}

export function buildSyntheticFetchedData(
  featureType: string,
  values: Record<string, unknown>
): Record<string, unknown> {
  const graphqlKey = featureTypeToGraphqlKey[featureType];
  if (!graphqlKey) return {};

  return {
    [graphqlKey]: [
      {
        id: -1,
        ...values,
        dokumenteArray: [],
      },
    ],
  };
}

export { featureTypeToSourceLayer, creationLabels };
