import { useState, useEffect, useCallback, useRef } from "react";
import { Modal, Button, Segmented } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { useSelector } from "react-redux";
import {
  LeuchteSearch,
  MastSearch,
  SchaltstelleSearch,
  MauerlascheSearch,
  ArbeitsauftragSearch,
} from "./featuresSearches";
import { getJWT } from "../../store/slices/auth";
import { ENDPOINT } from "../../constants/belis";
import RawDisplay from "./RawDisplay";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";

type SearchType = "arbeitsauftrag" | "leuchte" | "mast" | "schaltstelle" | "mauerlasche";

interface SearchModalProps {
  defaultOpen?: boolean;
  showFinalQuery?: boolean;
}

interface LeuchteSearchValues {
  inbetriebnahmeLeuchte?: { von?: string; bis?: string };
  wechseldatumLeuchtmittel?: { von?: string; bis?: string };
  naechsterLeuchtmittelwechsel?: { von?: string; bis?: string };
  leuchtentyp?: { value?: number };
  rundsteuerempfaenger?: { value?: number };
  schaltstelle?: { value?: string };
  dk1?: { value?: number };
  dk2?: { value?: number };
}

interface MastSearchValues {
  inbetriebnahmeMast?: { von?: string; bis?: string };
  mastschutz?: { von?: string; bis?: string };
  mastanstrich?: { von?: string; bis?: string };
  elektrischePruefung?: { von?: string; bis?: string };
  standsicherheitspruefung?: { von?: string; bis?: string };
  mastart?: { value?: number };
  masttyp?: { value?: number };
  klassifizierung?: { value?: number };
  anlagengruppe?: { value?: number };
  unterhaltMast?: { value?: number };
}

interface SchaltstelleSearchValues {
  bauart?: { value?: number };
  erstellungsjahr?: { von?: string; bis?: string };
  rundsteuerempfaenger?: { value?: number };
  einbaudatumRs?: { von?: string; bis?: string };
  pruefdatum?: { von?: string; bis?: string };
}

interface MauerlascheSearchValues {
  montage?: { von?: string; bis?: string };
  material?: { value?: number };
  pruefdatum?: { von?: string; bis?: string };
}

interface ArbeitsauftragSearchValues {
  bearbeitungsstand?: { value?: string };
  auftragsnummer?: { value?: string };
  zugewiesenAn?: { value?: number };
  angelegtAm?: { von?: string; bis?: string };
  angelegtVon?: { value?: string };
}

interface ProtokollItem {
  arbeitsprotokoll?: {
    id?: number;
    abzweigdose?: { id?: number };
    leitung?: { id?: number };
    mauerlasche?: { id?: number; geom_84?: { x?: number; y?: number } };
    schaltstelle?: { id?: number; geom_84?: { x?: number; y?: number } };
    tdta_leuchten?: {
      id?: number;
      tdta_standort_mast?: { geom_84?: { x?: number; y?: number } };
    };
    tdta_standort_mast?: {
      id?: number;
      geom_84?: { x?: number; y?: number };
    };
  };
}

type SearchValues =
  | LeuchteSearchValues
  | MastSearchValues
  | SchaltstelleSearchValues
  | MauerlascheSearchValues
  | ArbeitsauftragSearchValues;

const searchTypeLabels: Record<SearchType, string> = {
  arbeitsauftrag: "Arbeitsaufträge",
  leuchte: "Leuchten",
  mast: "Masten",
  schaltstelle: "Schaltstellen",
  mauerlasche: "Mauerlaschen",
};

// When true, GraphQL queries include all display fields (for future search results sidebar).
// When false, queries fetch only id + geom_84 (minimal, faster).
// Extended: ~527 KB / 341ms vs minimal: ~127 KB / 203ms (benchmarked).
const FETCH_EXTENDED_SEARCH_RESULTS = false;

const LEUCHTEN_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    leuchtennummer lfd_nummer fk_standort
    tkey_leuchtentyp { leuchtentyp fabrikat }
    tkey_strassenschluessel { pk strasse }
    tdta_standort_mast { lfd_nummer tkey_mastart { mastart } tkey_masttyp { masttyp } geom_84 { x y } }`
  : `id
    tdta_standort_mast { geom_84 { x y } }`;

const MAST_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    lfd_nummer
    tkey_mastart { mastart }
    tkey_masttyp { masttyp }
    tkey_strassenschluessel { pk strasse }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

const SCHALTSTELLE_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    schaltstellen_nummer
    bauart { bezeichnung }
    tkey_strassenschluessel { pk strasse }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

const MAUERLASCHE_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    laufende_nummer
    material_mauerlasche { bezeichnung }
    tkey_strassenschluessel { pk strasse }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

const ARBEITSAUFTRAG_FIELDS = `id
    nummer
    angelegt_am
    angelegt_von
    zugewiesen_an
    team { id name }
    ar_protokolleArray {
      arbeitsprotokoll {
        id
        abzweigdose { id }
        leitung { id }
        mauerlasche { id geom_84 { x y } }
        schaltstelle { id geom_84 { x y } }
        tdta_leuchten { id tdta_standort_mast { geom_84 { x y } } }
        tdta_standort_mast { id geom_84 { x y } }
      }
    }`;

const SearchModalHeader = ({
  searchType,
  onSearchTypeChange,
}: {
  searchType: SearchType;
  onSearchTypeChange: (type: SearchType) => void;
}) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
      <SearchOutlined className="text-xl text-blue-600" />
    </div>
    <div className="flex-1">
      <h2 className="text-lg font-semibold text-gray-900">Erweiterte Suche</h2>
      <Segmented
        size="small"
        value={searchType}
        onChange={(value) => onSearchTypeChange(value as SearchType)}
        options={Object.entries(searchTypeLabels).map(([value, label]) => ({
          value,
          label,
        }))}
        className="mt-1"
      />
    </div>
  </div>
);

// Helper to build date range condition (combines von/bis into single object)
// Database stores timestamps, so we need to include the full day for _lte
const buildDateRangeCondition = (
  fieldName: string,
  von?: string,
  bis?: string
): string | null => {
  const parts: string[] = [];
  if (von) {
    parts.push(`_gte: "${von.split("T")[0]}"`);
  }
  if (bis) {
    parts.push(`_lte: "${bis.split("T")[0]} 23:59:59"`);
  }
  return parts.length > 0 ? `${fieldName}: {${parts.join(", ")}}` : null;
};

// Build GraphQL where clause from search values
const buildLeuchteWhereClause = (values: LeuchteSearchValues): string => {
  const conditions: string[] = [];

  // Exclude deleted records (handle both false and null values)
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Date range conditions (combined into single objects)
  const inbetriebnahmeCondition = buildDateRangeCondition(
    "inbetriebnahme_leuchte",
    values.inbetriebnahmeLeuchte?.von,
    values.inbetriebnahmeLeuchte?.bis
  );
  if (inbetriebnahmeCondition) {
    conditions.push(inbetriebnahmeCondition);
  }

  // Wechseldatum - use direct field on tdta_leuchten
  const wechseldatumCondition = buildDateRangeCondition(
    "wechseldatum",
    values.wechseldatumLeuchtmittel?.von,
    values.wechseldatumLeuchtmittel?.bis
  );
  if (wechseldatumCondition) {
    conditions.push(wechseldatumCondition);
  }

  const naechsterWechselCondition = buildDateRangeCondition(
    "naechster_wechsel",
    values.naechsterLeuchtmittelwechsel?.von,
    values.naechsterLeuchtmittelwechsel?.bis
  );
  if (naechsterWechselCondition) {
    conditions.push(naechsterWechselCondition);
  }

  // Property conditions
  if (values.leuchtentyp?.value) {
    conditions.push(`fk_leuchttyp: {_eq: ${values.leuchtentyp.value}}`);
  }
  if (values.rundsteuerempfaenger?.value) {
    conditions.push(
      `rundsteuerempfaenger: {_eq: ${values.rundsteuerempfaenger.value}}`
    );
  }
  if (values.schaltstelle?.value) {
    conditions.push(`schaltstelle: {_ilike: "%${values.schaltstelle.value}%"}`);
  }
  if (values.dk1?.value) {
    conditions.push(`fk_dk1: {_eq: ${values.dk1.value}}`);
  }
  if (values.dk2?.value) {
    conditions.push(`fk_dk2: {_eq: ${values.dk2.value}}`);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

const buildMastWhereClause = (values: MastSearchValues): string => {
  const conditions: string[] = [];

  // Exclude deleted records (handle both false and null values)
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Only masts without leuchten
  conditions.push(`_not: {leuchtenArray: {}}`);

  // Date range conditions (combined into single objects)
  const inbetriebnahmeCondition = buildDateRangeCondition(
    "inbetriebnahme_mast",
    values.inbetriebnahmeMast?.von,
    values.inbetriebnahmeMast?.bis
  );
  if (inbetriebnahmeCondition) {
    conditions.push(inbetriebnahmeCondition);
  }

  const mastschutzCondition = buildDateRangeCondition(
    "mastschutz",
    values.mastschutz?.von,
    values.mastschutz?.bis
  );
  if (mastschutzCondition) {
    conditions.push(mastschutzCondition);
  }

  const mastanstrichCondition = buildDateRangeCondition(
    "mastanstrich",
    values.mastanstrich?.von,
    values.mastanstrich?.bis
  );
  if (mastanstrichCondition) {
    conditions.push(mastanstrichCondition);
  }

  const elekPruefungCondition = buildDateRangeCondition(
    "elek_pruefung",
    values.elektrischePruefung?.von,
    values.elektrischePruefung?.bis
  );
  if (elekPruefungCondition) {
    conditions.push(elekPruefungCondition);
  }

  const standsicherheitCondition = buildDateRangeCondition(
    "standsicherheitspruefung",
    values.standsicherheitspruefung?.von,
    values.standsicherheitspruefung?.bis
  );
  if (standsicherheitCondition) {
    conditions.push(standsicherheitCondition);
  }

  // Property conditions
  if (values.mastart?.value) {
    conditions.push(`fk_mastart: {_eq: ${values.mastart.value}}`);
  }
  if (values.masttyp?.value) {
    conditions.push(`fk_masttyp: {_eq: ${values.masttyp.value}}`);
  }
  if (values.klassifizierung?.value) {
    conditions.push(
      `fk_klassifizierung: {_eq: ${values.klassifizierung.value}}`
    );
  }
  if (values.anlagengruppe?.value) {
    conditions.push(`anlagengruppe: {_eq: ${values.anlagengruppe.value}}`);
  }
  if (values.unterhaltMast?.value) {
    conditions.push(
      `tkey_unterh_mast: {id: {_eq: ${values.unterhaltMast.value}}}`
    );
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

const buildSchaltstelleWhereClause = (
  values: SchaltstelleSearchValues
): string => {
  const conditions: string[] = [];

  // Exclude deleted records (handle both false and null values)
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Property conditions
  if (values.bauart?.value) {
    conditions.push(`fk_bauart: {_eq: ${values.bauart.value}}`);
  }
  if (values.rundsteuerempfaenger?.value) {
    conditions.push(
      `rundsteuerempfaenger: {_eq: ${values.rundsteuerempfaenger.value}}`
    );
  }

  // Date range conditions
  const erstellungsjahrCondition = buildDateRangeCondition(
    "erstellungsjahr",
    values.erstellungsjahr?.von,
    values.erstellungsjahr?.bis
  );
  if (erstellungsjahrCondition) {
    conditions.push(erstellungsjahrCondition);
  }

  const einbaudatumRsCondition = buildDateRangeCondition(
    "einbaudatum_rs",
    values.einbaudatumRs?.von,
    values.einbaudatumRs?.bis
  );
  if (einbaudatumRsCondition) {
    conditions.push(einbaudatumRsCondition);
  }

  const pruefdatumCondition = buildDateRangeCondition(
    "pruefdatum",
    values.pruefdatum?.von,
    values.pruefdatum?.bis
  );
  if (pruefdatumCondition) {
    conditions.push(pruefdatumCondition);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

const buildMauerlascheWhereClause = (
  values: MauerlascheSearchValues
): string => {
  const conditions: string[] = [];

  // Exclude deleted records (handle both false and null values)
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Property conditions
  if (values.material?.value) {
    conditions.push(`fk_material: {_eq: ${values.material.value}}`);
  }

  // Date range conditions - montage uses erstellungsjahr field
  const montageCondition = buildDateRangeCondition(
    "erstellungsjahr",
    values.montage?.von,
    values.montage?.bis
  );
  if (montageCondition) {
    conditions.push(montageCondition);
  }

  const pruefdatumCondition = buildDateRangeCondition(
    "pruefdatum",
    values.pruefdatum?.von,
    values.pruefdatum?.bis
  );
  if (pruefdatumCondition) {
    conditions.push(pruefdatumCondition);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

const buildArbeitsauftragWhereClause = (
  values: ArbeitsauftragSearchValues
): string => {
  const conditions: string[] = [];

  // Exclude deleted records
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Bearbeitungsstand - filter by protokoll status
  // "alle" = no condition, "offen" = at least one protokoll with schluessel "0", "abgearbeitet" = no protokoll with schluessel "0"
  if (values.bearbeitungsstand?.value === "offen") {
    conditions.push(
      `ar_protokolleArray: {arbeitsprotokoll: {arbeitsprotokollstatus: {schluessel: {_eq: "0"}}}}`
    );
  } else if (values.bearbeitungsstand?.value === "abgearbeitet") {
    conditions.push(
      `_not: {ar_protokolleArray: {arbeitsprotokoll: {arbeitsprotokollstatus: {schluessel: {_eq: "0"}}}}}`
    );
  }
  // "alle" or undefined = no condition added

  // Auftragsnummer
  if (values.auftragsnummer?.value) {
    conditions.push(`nummer: {_ilike: "%${values.auftragsnummer.value}%"}`);
  }

  // Zugewiesen an (Team)
  if (values.zugewiesenAn?.value) {
    conditions.push(`zugewiesen_an: {_eq: ${values.zugewiesenAn.value}}`);
  }

  // Angelegt am - date range
  const angelegtAmCondition = buildDateRangeCondition(
    "angelegt_am",
    values.angelegtAm?.von,
    values.angelegtAm?.bis
  );
  if (angelegtAmCondition) {
    conditions.push(angelegtAmCondition);
  }

  // Angelegt von
  if (values.angelegtVon?.value) {
    conditions.push(`angelegt_von: {_ilike: "%${values.angelegtVon.value}%"}`);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

// Helper to generate query string for preview
const generateQueryString = (
  searchType: SearchType,
  values: SearchValues
): string => {
  if (searchType === "arbeitsauftrag") {
    const whereClause = buildArbeitsauftragWhereClause(
      values as ArbeitsauftragSearchValues
    );
    return `query ArbeitsauftragSearch {
  arbeitsauftrag(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {angelegt_am: desc}) {
    ${ARBEITSAUFTRAG_FIELDS}
  }
}`;
  } else if (searchType === "leuchte") {
    const whereClause = buildLeuchteWhereClause(values as LeuchteSearchValues);
    return `query LeuchtenSearch {
  tdta_leuchten(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {einbaudatum: desc}) {
    ${LEUCHTEN_FIELDS}
  }
}`;
  } else if (searchType === "mast") {
    const whereClause = buildMastWhereClause(values as MastSearchValues);
    return `query MastSearch {
  tdta_standort_mast(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {inbetriebnahme_mast: desc}) {
    ${MAST_FIELDS}
  }
}`;
  } else if (searchType === "schaltstelle") {
    const whereClause = buildSchaltstelleWhereClause(
      values as SchaltstelleSearchValues
    );
    return `query SchaltstelleSearch {
  schaltstelle(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {erstellungsjahr: desc}) {
    ${SCHALTSTELLE_FIELDS}
  }
}`;
  } else {
    const whereClause = buildMauerlascheWhereClause(
      values as MauerlascheSearchValues
    );
    return `query MauerlascheSearch {
  mauerlasche(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {erstellungsjahr: desc}) {
    ${MAUERLASCHE_FIELDS}
  }
}`;
  }
};

const SearchModal = ({
  defaultOpen = false,
  showFinalQuery = false,
}: SearchModalProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchType, setSearchType] = useState<SearchType>("arbeitsauftrag");
  const [isSearching, setIsSearching] = useState(false);
  const [queryPreview, setQueryPreview] = useState<string>("");
  const [noResults, setNoResults] = useState(false);

  const jwt = useSelector(getJWT);
  const { map } = useLibreContext();
  const { setHighlightingActive, highlightByIds, clearHighlights } =
    useMapHighlight();

  // Store current search values
  const searchValuesRef = useRef<SearchValues>({});

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  // Clear noResults message after 2 seconds
  useEffect(() => {
    if (noResults) {
      const timer = setTimeout(() => setNoResults(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [noResults]);

  // Update query preview when search type changes
  useEffect(() => {
    if (showFinalQuery) {
      setQueryPreview(generateQueryString(searchType, searchValuesRef.current));
    }
  }, [searchType, showFinalQuery]);

  const handleValuesChange = useCallback(
    (values: SearchValues) => {
      searchValuesRef.current = values;
      if (showFinalQuery) {
        setQueryPreview(generateQueryString(searchType, values));
      }
    },
    [searchType, showFinalQuery]
  );

  // Generic GraphQL search handler
  const handleGraphQLSearch = useCallback(
    (options: {
      query: string;
      dataKey: string;
      featurePrefix: string;
      getGeometry: (
        item: Record<string, unknown>
      ) => [number, number] | undefined;
      getAllGeometries?: (
        item: Record<string, unknown>
      ) => Array<[number, number]>;
      getHighlightIds?: (item: Record<string, unknown>) => string[];
      logPrefix?: string;
    }) => {
      const {
        query,
        dataKey,
        featurePrefix,
        getGeometry,
        getAllGeometries,
        getHighlightIds,
        logPrefix = "[SEARCH]",
      } = options;

      if (!jwt) {
        console.warn(`${logPrefix} No JWT available, please log in first`);
        return;
      }

      setIsSearching(true);
      setNoResults(false);
      // console.log(`xxx ${logPrefix} Fetching data...`);
      // console.log(`xxx ${logPrefix} Query:`, query);

      fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ query }),
      })
        .then((res) => res.json())
        .then((json) => {
          // console.log(`xxx ${logPrefix} Raw result:`, json);
          const results = json.data?.[dataKey] ?? [];
          console.log(
            `xxx ${logPrefix} Result count:`,
            results.length,
            ...(showFinalQuery ? [results] : [])
          );

          if (results.length === 0) {
            console.warn(`xxx ${logPrefix} No results found`);
            setNoResults(true);
            setIsSearching(false);
            return;
          }

          const t0 = performance.now();
          const coords: [number, number][] = [];
          for (const item of results as Record<string, unknown>[]) {
            if (getAllGeometries) {
              coords.push(...getAllGeometries(item));
            } else {
              const geom = getGeometry(item);
              if (geom) coords.push(geom);
            }
          }
          const t1 = performance.now();

          if (coords.length === 0) {
            console.warn(`${logPrefix} No coordinates found`);
            setIsSearching(false);
            return;
          }

          const rawBbox = {
            minLng: Math.min(...coords.map((c) => c[0])),
            maxLng: Math.max(...coords.map((c) => c[0])),
            minLat: Math.min(...coords.map((c) => c[1])),
            maxLat: Math.max(...coords.map((c) => c[1])),
          };
          const t2 = performance.now();
          console.log(
            `[SEARCH] ${coords.length} coords: transform=${(t1 - t0).toFixed(
              1
            )}ms, bbox=${(t2 - t1).toFixed(1)}ms, total=${(t2 - t0).toFixed(
              1
            )}ms`
          );
          // Expand bbox by 10% on each side to ensure all features are visible
          const lngPadding = (rawBbox.maxLng - rawBbox.minLng) * 0.1 || 0.001;
          const latPadding = (rawBbox.maxLat - rawBbox.minLat) * 0.1 || 0.001;
          const bbox = {
            minLng: rawBbox.minLng - lngPadding,
            maxLng: rawBbox.maxLng + lngPadding,
            minLat: rawBbox.minLat - latPadding,
            maxLat: rawBbox.maxLat + latPadding,
          };

          // Highlight the returned features on the map
          let highlightArray: string[];
          if (getHighlightIds) {
            highlightArray = [
              ...new Set(
                (results as Record<string, unknown>[]).flatMap((item) =>
                  getHighlightIds(item)
                )
              ),
            ];
          } else {
            const ids = results
              .map((item: Record<string, unknown>) => String(item.id))
              .filter(Boolean);
            highlightArray = ids.map((id: string) => `${featurePrefix}:${id}`);
          }
          clearHighlights();
          setHighlightingActive(true);
          highlightByIds(highlightArray);
          console.log(`${logPrefix} Highlighting:`, highlightArray);
          // console.log(`${logPrefix} Highlighted`, ids.length, "features");
          // console.log(`${logPrefix} Highlight Array`, highlightArray);

          if (map) {
            map.fitBounds(
              [
                [bbox.minLng, bbox.minLat],
                [bbox.maxLng, bbox.maxLat],
              ],
              { padding: 50 }
            );
            map.once("idle", () => {
              clearHighlights();
              setHighlightingActive(true);
              highlightByIds(highlightArray);
            });
          }

          setIsSearching(false);
          setIsOpen(false);
        })
        .catch((err) => {
          console.error(`${logPrefix} Error:`, err);
          setIsSearching(false);
        });
    },
    [jwt, map, clearHighlights, setHighlightingActive, highlightByIds]
  );

  // Execute search based on current search type and values
  const executeSearch = useCallback(() => {
    const values = searchValuesRef.current;

    if (searchType === "arbeitsauftrag") {
      const whereClause = buildArbeitsauftragWhereClause(
        values as ArbeitsauftragSearchValues
      );
      const query = `query ArbeitsauftragSearch {
        arbeitsauftrag(${
          whereClause ? `${whereClause}, ` : ""
        }order_by: {angelegt_am: desc}) {
          ${ARBEITSAUFTRAG_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "arbeitsauftrag",
        featurePrefix: "arbeitsauftrag",
        logPrefix: "[ARBEITSAUFTRAG_SEARCH]",
        getGeometry: (item) => {
          const protokolle = item.ar_protokolleArray as ProtokollItem[] | undefined;
          if (!protokolle || protokolle.length === 0) return undefined;

          for (const p of protokolle) {
            const ap = p.arbeitsprotokoll;
            if (!ap) continue;

            // Check features that have direct geometry (mast, schaltstelle, mauerlasche)
            const featuresToCheck = [
              ap.tdta_standort_mast,
              ap.schaltstelle,
              ap.mauerlasche,
            ];

            for (const feature of featuresToCheck) {
              if (feature?.geom_84?.x != null && feature?.geom_84?.y != null) {
                return [feature.geom_84.x, feature.geom_84.y];
              }
            }

            // Leuchte has nested geometry via its mast
            if (ap.tdta_leuchten?.tdta_standort_mast?.geom_84) {
              const geom = ap.tdta_leuchten.tdta_standort_mast.geom_84;
              if (geom.x != null && geom.y != null) {
                return [geom.x, geom.y];
              }
            }
          }
          return undefined;
        },
        getAllGeometries: (item) => {
          const protokolle = item.ar_protokolleArray as ProtokollItem[] | undefined;
          if (!protokolle) return [];

          const geometries: [number, number][] = [];
          for (const p of protokolle) {
            const ap = p.arbeitsprotokoll;
            if (!ap) continue;

            let found = false;

            // Check features that have direct geometry (mast, schaltstelle, mauerlasche)
            const featuresToCheck = [
              ap.tdta_standort_mast,
              ap.schaltstelle,
              ap.mauerlasche,
            ];

            for (const feature of featuresToCheck) {
              if (feature?.geom_84?.x != null && feature?.geom_84?.y != null) {
                geometries.push([feature.geom_84.x, feature.geom_84.y]);
                found = true;
                break;
              }
            }

            // Leuchte has nested geometry via its mast
            if (!found && ap.tdta_leuchten?.tdta_standort_mast?.geom_84) {
              const geom = ap.tdta_leuchten.tdta_standort_mast.geom_84;
              if (geom.x != null && geom.y != null) {
                geometries.push([geom.x, geom.y]);
              }
            }
          }
          return geometries;
        },
        getHighlightIds: (item) => {
          const protokolle = item.ar_protokolleArray as ProtokollItem[] | undefined;
          if (!protokolle) return [];

          const ids: string[] = [];
          for (const p of protokolle) {
            const ap = p.arbeitsprotokoll;
            if (!ap) continue;

            if (ap.tdta_standort_mast?.id != null) {
              ids.push(`mast:${ap.tdta_standort_mast.id}`);
            }
            if (ap.tdta_leuchten?.id != null) {
              ids.push(`leuchten:${ap.tdta_leuchten.id}`);
            }
            if (ap.schaltstelle?.id != null) {
              ids.push(`schaltstelle:${ap.schaltstelle.id}`);
            }
            if (ap.mauerlasche?.id != null) {
              ids.push(`mauerlaschen:${ap.mauerlasche.id}`);
            }
            if (ap.leitung?.id != null) {
              ids.push(`leitungen:${ap.leitung.id}`);
            }
            if (ap.abzweigdose?.id != null) {
              ids.push(`abzweigdosen:${ap.abzweigdose.id}`);
            }
          }
          return ids;
        },
      });
    } else if (searchType === "leuchte") {
      const whereClause = buildLeuchteWhereClause(
        values as LeuchteSearchValues
      );
      const query = `query LeuchtenSearch {
        tdta_leuchten(${
          whereClause ? `${whereClause}, ` : ""
        }order_by: {einbaudatum: desc}) {
          ${LEUCHTEN_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "tdta_leuchten",
        featurePrefix: "leuchten",
        logPrefix: "[LEUCHTE_SEARCH]",
        getGeometry: (item) => {
          const mast = item.tdta_standort_mast as
            | Record<string, unknown>
            | undefined;
          const geom = mast?.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (searchType === "mast") {
      const whereClause = buildMastWhereClause(values as MastSearchValues);
      const query = `query MastSearch {
        tdta_standort_mast(${
          whereClause ? `${whereClause}, ` : ""
        }order_by: {inbetriebnahme_mast: desc}) {
          ${MAST_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "tdta_standort_mast",
        featurePrefix: "mast",
        logPrefix: "[MAST_SEARCH]",
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (searchType === "schaltstelle") {
      const whereClause = buildSchaltstelleWhereClause(
        values as SchaltstelleSearchValues
      );
      const query = `query SchaltstelleSearch {
        schaltstelle(${
          whereClause ? `${whereClause}, ` : ""
        }order_by: {erstellungsjahr: desc}) {
          ${SCHALTSTELLE_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "schaltstelle",
        featurePrefix: "schaltstelle",
        logPrefix: "[SCHALTSTELLE_SEARCH]",
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (searchType === "mauerlasche") {
      const whereClause = buildMauerlascheWhereClause(
        values as MauerlascheSearchValues
      );
      const query = `query MauerlascheSearch {
        mauerlasche(${
          whereClause ? `${whereClause}, ` : ""
        }order_by: {erstellungsjahr: desc}) {
          ${MAUERLASCHE_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "mauerlasche",
        featurePrefix: "mauerlaschen",
        logPrefix: "[MAUERLASCHE_SEARCH]",
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    }
  }, [searchType, handleGraphQLSearch]);

  const renderSearchComponent = () => {
    switch (searchType) {
      case "leuchte":
        return <LeuchteSearch onValuesChange={handleValuesChange} />;
      case "mast":
        return <MastSearch onValuesChange={handleValuesChange} />;
      case "schaltstelle":
        return <SchaltstelleSearch onValuesChange={handleValuesChange} />;
      case "mauerlasche":
        return <MauerlascheSearch onValuesChange={handleValuesChange} />;
      case "arbeitsauftrag":
      default:
        return <ArbeitsauftragSearch onValuesChange={handleValuesChange} />;
    }
  };

  return (
    <>
      <Icon
        icon={faFilter}
        onClick={() => setIsOpen(true)}
        title="Erweiterte Suche"
        className="text-blue-600 cursor-pointer hover:text-blue-800"
      />

      <Modal
        title={
          <SearchModalHeader
            searchType={searchType}
            onSearchTypeChange={setSearchType}
          />
        }
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              {noResults && "Keine Ergebnisse gefunden"}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
              <Button
                type="primary"
                onClick={executeSearch}
                loading={isSearching}
              >
                Suchen
              </Button>
            </div>
          </div>
        }
        width={900}
        centered
        styles={{
          body: { paddingTop: 16 },
          header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
        }}
      >
        <div
          style={{
            height: showFinalQuery
              ? "min(400px, calc(100vh - 450px))"
              : "min(640px, calc(100vh - 250px))",
            overflowY: "auto",
            paddingRight: 8,
          }}
        >
          {renderSearchComponent()}
        </div>
        {showFinalQuery && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="text-sm font-medium text-gray-500 mb-2">
              GraphQL Query:
            </div>
            <RawDisplay maxHeight={200}>{queryPreview}</RawDisplay>
          </div>
        )}
      </Modal>
    </>
  );
};

export default SearchModal;
