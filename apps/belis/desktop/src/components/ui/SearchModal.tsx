import { useState, useEffect, useCallback, useRef } from "react";
// Switch is only used by the temporarily hidden Expertensuche toggle below.
import { Modal, Button, Switch } from "antd";
import { SearchOutlined, CloseOutlined } from "@ant-design/icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { useSelector, useDispatch } from "react-redux";
import {
  LeuchteSearch,
  MastSearch,
  SchaltstelleSearch,
  MauerlascheSearch,
  ArbeitsauftragSearch,
} from "./featuresSearches";
import { getJWT } from "../../store/slices/auth";
import {
  resetType,
  getExpertTypeHasIncompleteRule,
  getExpertTypeState,
} from "../../store/slices/expertSearch";
import { REGISTRY } from "./expert-search/fieldRegistry";
import type { ObjectType } from "./expert-search/fieldRegistry";
import {
  buildExpertWhereClause,
  buildExpertOrderBy,
  buildExpertLimit,
  buildExpertSortSpec,
} from "./expert-search/expertSearchUtils";
import type { ExpertSortSpec } from "./expert-search/expertSearchUtils";
import { ENDPOINT } from "../../constants/belis";
import {
  LEUCHTEN_FIELDS,
  MAST_FIELDS,
  SCHALTSTELLE_FIELDS,
  MAUERLASCHE_FIELDS,
  LEITUNG_FIELDS,
} from "../../constants/searchFields";
import RawDisplay from "./RawDisplay";
import ExpertSearch from "./expert-search/ExpertSearch";
import {
  useLibreContext,
  useMapHighlight,
  slugifyUrl,
} from "@carma-mapping/engines/maplibre";
import type { SidebarFeature } from "./BelisSidebar";
import {
  BELIS_STYLE_URL,
  BELIS_ORIGINAL_SOURCE,
} from "../../config/mapLayerConfigs";
import { flattenGqlRecord } from "../../helper/flattenGqlRecord";
import { convertGeoFieldToWgs84 } from "../../helper/buildApGeoJson";
import {
  buildDateRangeCondition,
  buildArbeitsauftragWhereClause,
} from "../../helper/arbeitsauftragSearchUtils";
import type { ArbeitsauftragSearchValues } from "../../helper/arbeitsauftragSearchUtils";

type SearchType =
  | "arbeitsauftrag"
  | "leuchte"
  | "mast"
  | "schaltstelle"
  | "mauerlasche"
  | "leitung";

interface SearchModalProps {
  defaultOpen?: boolean;
  showFinalQuery?: boolean;
  // `meta.expertSort` is the sort list (field + direction) the user picked in
  // Expert Search — empty for classic searches. The sidebar applies the same
  // ordering to its rows via its `expertSort` prop.
  onSearchResults?: (
    features: SidebarFeature[] | null,
    meta?: { expertSort?: ExpertSortSpec }
  ) => void;
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
  bezirk?: { value?: number };
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
  bezirk?: { value?: number };
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

const searchTypeLabels: Partial<Record<SearchType, string>> = {
  // arbeitsauftrag: "Arbeitsaufträge", // temporarily hidden
  leuchte: "Leuchten",
  mast: "Standorte",
  schaltstelle: "Schaltstellen",
  mauerlasche: "Mauerlaschen",
  leitung: "Leitungen",
};

// Object types that only exist in the expert search (no classic form / where
// builder). Their tabs are hidden while the Expertensuche switch is off.
const EXPERT_ONLY_TYPES: ReadonlySet<SearchType> = new Set(["leitung"]);

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
  isExpertSearch,
  onExpertSearchChange,
  onClose,
  isQueryView,
  showQueryTab,
  onSelectQueryTab,
}: {
  searchType: SearchType;
  onSearchTypeChange: (type: SearchType) => void;
  isExpertSearch: boolean;
  onExpertSearchChange: (value: boolean) => void;
  onClose: () => void;
  isQueryView: boolean;
  showQueryTab: boolean;
  onSelectQueryTab: () => void;
}) => (
  <div className="flex flex-col gap-5">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <SearchOutlined className="text-xl text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 mb-0">
          Erweiterte Suche
        </h2>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* temporarily hidden for the merge — re-enable to expose the expert search
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium text-gray-700">
            Expertensuche
          </span>
          <Switch checked={isExpertSearch} onChange={onExpertSearchChange} />
        </div>
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 border-none cursor-pointer transition-colors"
        >
          <CloseOutlined />
        </button>
      </div>
    </div>
    <div className="flex items-center gap-6 border-b border-gray-200 -mx-6 px-6">
      {Object.entries(searchTypeLabels)
        .filter(
          ([value]) => isExpertSearch || !EXPERT_ONLY_TYPES.has(value as SearchType)
        )
        .map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onSearchTypeChange(value as SearchType)}
          className={`text-sm pb-2 -mb-px border-b-2 bg-transparent cursor-pointer transition-colors ${
            !isQueryView && searchType === value
              ? "text-blue-600 border-blue-600 font-medium"
              : "text-gray-500 border-transparent hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
      {showQueryTab && (
        <button
          type="button"
          onClick={onSelectQueryTab}
          className={`text-sm pb-2 -mb-px border-b-2 bg-transparent cursor-pointer transition-colors ${
            isQueryView
              ? "text-blue-600 border-blue-600 font-medium"
              : "text-gray-500 border-transparent hover:text-gray-700"
          }`}
        >
          GraphQL
        </button>
      )}
    </div>
  </div>
);

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
  if (values.bezirk?.value) {
    conditions.push(
      `tdta_standort_mast: {tkey_bezirk: {id: {_eq: ${values.bezirk.value}}}}`
    );
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

const buildMastWhereClause = (values: MastSearchValues): string => {
  const conditions: string[] = [];

  // Exclude deleted records (handle both false and null values)
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

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
  if (values.bezirk?.value) {
    conditions.push(`tkey_bezirk: {id: {_eq: ${values.bezirk.value}}}`);
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

// Helper to generate query string for preview
const generateQueryString = (
  searchType: SearchType,
  values: SearchValues,
  whereOverride?: string | null,
  orderByOverride?: string,
  limitOverride?: string
): string => {
  // Assemble the parenthesised query args (where / order_by / limit), dropping
  // empty parts. The overrides come from the expert search — when it is active
  // (orderByOverride passed) an empty order means NO order_by at all; classic
  // searches pass no overrides and keep their per-type default order.
  const isExpert = orderByOverride !== undefined;
  const args = (whereClause: string, defaultOrder: string) => {
    const orderBy = isExpert ? orderByOverride : defaultOrder;
    return [whereClause, orderBy, limitOverride].filter(Boolean).join(", ");
  };
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
    const whereClause =
      whereOverride ?? buildLeuchteWhereClause(values as LeuchteSearchValues);
    return `query LeuchtenSearch {
  tdta_leuchten(${args(whereClause, "order_by: {einbaudatum: desc}")}) {
    ${LEUCHTEN_FIELDS}
  }
}`;
  } else if (searchType === "mast") {
    const whereClause =
      whereOverride ?? buildMastWhereClause(values as MastSearchValues);
    return `query MastSearch {
  tdta_standort_mast(${args(whereClause, "order_by: {inbetriebnahme_mast: desc}")}) {
    ${MAST_FIELDS}
  }
}`;
  } else if (searchType === "schaltstelle") {
    const whereClause =
      whereOverride ??
      buildSchaltstelleWhereClause(values as SchaltstelleSearchValues);
    return `query SchaltstelleSearch {
  schaltstelle(${args(whereClause, "order_by: {erstellungsjahr: desc}")}) {
    ${SCHALTSTELLE_FIELDS}
  }
}`;
  } else if (searchType === "leitung") {
    // Leitungen exist only in the expert search, so there is no classic
    // where builder — the where clause always comes from whereOverride.
    const whereClause = whereOverride ?? "";
    return `query LeitungSearch {
  leitung(${args(whereClause, "order_by: {id: desc}")}) {
    ${LEITUNG_FIELDS}
  }
}`;
  } else {
    const whereClause =
      whereOverride ??
      buildMauerlascheWhereClause(values as MauerlascheSearchValues);
    return `query MauerlascheSearch {
  mauerlasche(${args(whereClause, "order_by: {erstellungsjahr: desc}")}) {
    ${MAUERLASCHE_FIELDS}
  }
}`;
  }
};

// Mapping from search type to source-layer for sidebar features
const SEARCH_TYPE_SIDEBAR_META: Record<string, { sourceLayer: string }> = {
  leuchte: { sourceLayer: "leuchten" },
  mast: { sourceLayer: "standorte" },
  schaltstelle: { sourceLayer: "schaltstelle" },
  mauerlasche: { sourceLayer: "mauerlaschen" },
  leitung: { sourceLayer: "leitungen" },
};

// Entity type mapping for arbeitsauftrag protokoll items
const PROTOKOLL_ENTITY_META: Record<string, { sourceLayer: string }> = {
  tdta_leuchten: { sourceLayer: "leuchten" },
  tdta_standort_mast: { sourceLayer: "standorte" },
  schaltstelle: { sourceLayer: "schaltstelle" },
  mauerlasche: { sourceLayer: "mauerlaschen" },
};

// Leitungen are line features with no geom_84 point. Derive a representative
// WGS84 point (line midpoint) from their EPSG:25832 `geom.geo_field` so the
// map can fit-to-bounds and the sidebar "Auf Fachobjekt zoomen" has a real
// target instead of falling back to [0, 0].
const leitungPoint = (
  item: Record<string, unknown>
): [number, number] | undefined => {
  const geoField = (item.geom as { geo_field?: unknown } | undefined)
    ?.geo_field;
  const wgs = convertGeoFieldToWgs84(geoField);
  if (!wgs) return undefined;
  const midOf = (ring: number[][]): [number, number] | undefined => {
    if (!ring.length) return undefined;
    return ring[Math.floor(ring.length / 2)] as [number, number];
  };
  if (wgs.type === "Point") return wgs.coordinates as [number, number];
  if (wgs.type === "LineString") return midOf(wgs.coordinates);
  if (wgs.type === "MultiLineString") return midOf(wgs.coordinates[0] ?? []);
  return undefined;
};

/** Convert flat GraphQL results into SidebarFeature[] */
const convertResultsToSidebarFeatures = (
  results: Record<string, unknown>[],
  searchType: SearchType,
  namespacedSource: string
): SidebarFeature[] => {
  if (searchType === "arbeitsauftrag") {
    // For arbeitsauftrag, iterate protokolle and create one feature per referenced entity
    const features: SidebarFeature[] = [];
    for (const item of results) {
      const protokolle = item.ar_protokolleArray as ProtokollItem[] | undefined;
      if (!protokolle) continue;
      for (const p of protokolle) {
        const ap = p.arbeitsprotokoll;
        if (!ap) continue;

        // Check each entity type
        for (const [entityKey, meta] of Object.entries(PROTOKOLL_ENTITY_META)) {
          const entity = ap[entityKey as keyof typeof ap] as
            | Record<string, unknown>
            | undefined;
          if (!entity || entity.id == null) continue;

          // Get geometry
          let coords: [number, number] | undefined;
          if (entityKey === "tdta_leuchten") {
            const mast = (entity as Record<string, unknown>)
              .tdta_standort_mast as
              | { geom_84?: { x?: number; y?: number } }
              | undefined;
            if (mast?.geom_84?.x != null && mast?.geom_84?.y != null) {
              coords = [mast.geom_84.x, mast.geom_84.y];
            }
          } else {
            const geom = (entity as Record<string, unknown>).geom_84 as
              | { x?: number; y?: number }
              | undefined;
            if (geom?.x != null && geom?.y != null) {
              coords = [geom.x, geom.y];
            }
          }

          features.push({
            type: "Feature",
            source: namespacedSource,
            sourceLayer: meta.sourceLayer,
            id: entity.id as number,
            properties: flattenGqlRecord(
              entity as Record<string, any>,
              meta.sourceLayer
            ),
            geometry: coords
              ? { type: "Point", coordinates: coords }
              : { type: "Point", coordinates: [0, 0] },
            state: {},
          } as unknown as SidebarFeature);
        }
      }
    }
    return features;
  }

  // Non-arbeitsauftrag: direct mapping
  const meta = SEARCH_TYPE_SIDEBAR_META[searchType];
  if (!meta) return [];

  return results.map((item) => {
    // Get geometry
    let coords: [number, number] | undefined;
    if (searchType === "leuchte") {
      const mast = item.tdta_standort_mast as
        | { geom_84?: { x?: number; y?: number } }
        | undefined;
      if (mast?.geom_84?.x != null && mast?.geom_84?.y != null) {
        coords = [mast.geom_84.x, mast.geom_84.y];
      }
    } else if (searchType === "leitung") {
      coords = leitungPoint(item);
    } else {
      const geom = item.geom_84 as { x?: number; y?: number } | undefined;
      if (geom?.x != null && geom?.y != null) {
        coords = [geom.x, geom.y];
      }
    }

    return {
      type: "Feature",
      source: namespacedSource,
      sourceLayer: meta.sourceLayer,
      id: item.id as number,
      properties: flattenGqlRecord(
        item as Record<string, any>,
        meta.sourceLayer
      ),
      geometry: coords
        ? { type: "Point", coordinates: coords }
        : { type: "Point", coordinates: [0, 0] },
      state: {},
    } as unknown as SidebarFeature;
  });
};

const SearchModal = ({
  defaultOpen = false,
  showFinalQuery = false,
  onSearchResults,
}: SearchModalProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchType, setSearchType] = useState<SearchType>("leuchte");
  const [isExpertSearch, setIsExpertSearch] = useState(false);
  const [isQueryView, setIsQueryView] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [queryPreview, setQueryPreview] = useState<string>("");
  const [noResults, setNoResults] = useState(false);

  const jwt = useSelector(getJWT);
  const dispatch = useDispatch();
  const { map } = useLibreContext();

  // arbeitsauftrag has no scalar filter surface in expert mode; fall back to leuchte.
  const expertObjectType: ObjectType =
    searchType === "arbeitsauftrag" ? "leuchte" : searchType;

  // In expert mode, block the search while any rule is missing its value.
  const expertHasIncompleteRule = useSelector(
    getExpertTypeHasIncompleteRule(expertObjectType)
  );
  const searchDisabled = isExpertSearch && expertHasIncompleteRule;

  // The current expert filter tree — fed to buildExpertWhereClause on Suchen.
  const expertTypeState = useSelector(getExpertTypeState(expertObjectType));
  const { setHighlightingActive, highlightByIds, clearHighlights } =
    useMapHighlight();

  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;

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
      forSearchType: SearchType;
      getGeometry: (
        item: Record<string, unknown>
      ) => [number, number] | undefined;
      getAllGeometries?: (
        item: Record<string, unknown>
      ) => Array<[number, number]>;
      getHighlightIds?: (item: Record<string, unknown>) => string[];
      logPrefix?: string;
      // Sort spec the query used (empty for classic searches). Passed through
      // in the `onSearchResults` meta so the sidebar can order its rows the
      // same way.
      expertSort?: ExpertSortSpec;
    }) => {
      const {
        query,
        dataKey,
        featurePrefix,
        forSearchType,
        getGeometry,
        getAllGeometries,
        getHighlightIds,
        logPrefix = "[SEARCH]",
        expertSort = [],
      } = options;

      if (!jwt) {
        console.warn(`${logPrefix} No JWT available, please log in first`);
        return;
      }

      setIsSearching(true);
      setNoResults(false);

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
          const results = json.data?.[dataKey] ?? [];

          if (results.length === 0) {
            setNoResults(true);
            setIsSearching(false);
            return;
          }

          const coords: [number, number][] = [];
          for (const item of results as Record<string, unknown>[]) {
            if (getAllGeometries) {
              coords.push(...getAllGeometries(item));
            } else {
              const geom = getGeometry(item);
              if (geom) coords.push(geom);
            }
          }

          // Some result types (e.g. Leitungen, line features) carry no point
          // geometry. They can still be highlighted by id against their tile
          // layer — we just skip the fit-to-bounds step below.
          const hasCoords = coords.length > 0;

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
          // console.log(`${logPrefix} Highlighted`, ids.length, "features");
          // console.log(`${logPrefix} Highlight Array`, highlightArray);

          if (map && hasCoords) {
            const rawBbox = {
              minLng: Math.min(...coords.map((c) => c[0])),
              maxLng: Math.max(...coords.map((c) => c[0])),
              minLat: Math.min(...coords.map((c) => c[1])),
              maxLat: Math.max(...coords.map((c) => c[1])),
            };
            // Expand bbox by 10% on each side to ensure all features are visible
            const lngPadding = (rawBbox.maxLng - rawBbox.minLng) * 0.1 || 0.001;
            const latPadding = (rawBbox.maxLat - rawBbox.minLat) * 0.1 || 0.001;
            const bbox = {
              minLng: rawBbox.minLng - lngPadding,
              maxLng: rawBbox.maxLng + lngPadding,
              minLat: rawBbox.minLat - latPadding,
              maxLat: rawBbox.maxLat + latPadding,
            };
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

          // Convert results to sidebar features and emit
          if (onSearchResults) {
            const sidebarFeatures = convertResultsToSidebarFeatures(
              results as Record<string, unknown>[],
              forSearchType,
              namespacedSource
            );
            onSearchResults(sidebarFeatures, { expertSort });
          }

          setIsSearching(false);
          setIsOpen(false);
        })
        .catch((err) => {
          console.error(`${logPrefix} Error:`, err);
          setIsSearching(false);
        });
    },
    [
      jwt,
      map,
      clearHighlights,
      setHighlightingActive,
      highlightByIds,
      onSearchResults,
      namespacedSource,
    ]
  );

  // Execute search based on current search type and values
  const executeSearch = useCallback(() => {
    const values = searchValuesRef.current;

    // In expert mode the where clause comes from the query builder (redux),
    // and the query targets the object type behind the tab (arbeitsauftrag →
    // leuchte, which has no scalar filter surface of its own).
    const effectiveType: SearchType = isExpertSearch
      ? expertObjectType
      : searchType;
    const expertWhere = isExpertSearch
      ? buildExpertWhereClause(expertTypeState, REGISTRY[expertObjectType])
      : null;
    // In expert mode the user chooses the sort order and result limit. When they
    // add no sort, expertOrderBy is "" and NO order_by is emitted (the default
    // per-type order is only used by the classic searches).
    const expertOrderBy = isExpertSearch
      ? buildExpertOrderBy(expertTypeState, REGISTRY[expertObjectType])
      : "";
    const expertLimit = isExpertSearch ? buildExpertLimit(expertTypeState) : "";
    // Structured mirror of `expertOrderBy` for the sidebar sort. Empty for
    // classic searches or when the user set no sort rows.
    const expertSort: ExpertSortSpec = isExpertSearch
      ? buildExpertSortSpec(expertTypeState, REGISTRY[expertObjectType])
      : [];
    // Assemble the parenthesised query args, dropping any empty part so there is
    // never a trailing comma or an empty order_by.
    const args = (whereClause: string, defaultOrder: string) => {
      const orderBy = isExpertSearch ? expertOrderBy : defaultOrder;
      return [whereClause, orderBy, expertLimit].filter(Boolean).join(", ");
    };

    if (effectiveType === "arbeitsauftrag") {
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
        forSearchType: "arbeitsauftrag",
        logPrefix: "[ARBEITSAUFTRAG_SEARCH]",
        getGeometry: (item) => {
          const protokolle = item.ar_protokolleArray as
            | ProtokollItem[]
            | undefined;
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
          const protokolle = item.ar_protokolleArray as
            | ProtokollItem[]
            | undefined;
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
          const protokolle = item.ar_protokolleArray as
            | ProtokollItem[]
            | undefined;
          if (!protokolle) return [];

          const ids: string[] = [];
          for (const p of protokolle) {
            const ap = p.arbeitsprotokoll;
            if (!ap) continue;

            if (ap.tdta_standort_mast?.id != null) {
              ids.push(`standorte:${ap.tdta_standort_mast.id}`);
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
    } else if (effectiveType === "leuchte") {
      const whereClause =
        expertWhere ?? buildLeuchteWhereClause(values as LeuchteSearchValues);
      const query = `query LeuchtenSearch {
        tdta_leuchten(${args(
          whereClause,
          "order_by: {einbaudatum: desc}"
        )}) {
          ${LEUCHTEN_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "tdta_leuchten",
        featurePrefix: "leuchten",
        forSearchType: "leuchte",
        logPrefix: "[LEUCHTE_SEARCH]",
        expertSort,
        getGeometry: (item) => {
          const mast = item.tdta_standort_mast as
            | Record<string, unknown>
            | undefined;
          const geom = mast?.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (effectiveType === "mast") {
      const whereClause =
        expertWhere ?? buildMastWhereClause(values as MastSearchValues);
      const query = `query MastSearch {
        tdta_standort_mast(${args(
          whereClause,
          "order_by: {inbetriebnahme_mast: desc}"
        )}) {
          ${MAST_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "tdta_standort_mast",
        featurePrefix: "standorte",
        forSearchType: "mast",
        logPrefix: "[MAST_SEARCH]",
        expertSort,
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (effectiveType === "schaltstelle") {
      const whereClause =
        expertWhere ??
        buildSchaltstelleWhereClause(values as SchaltstelleSearchValues);
      const query = `query SchaltstelleSearch {
        schaltstelle(${args(
          whereClause,
          "order_by: {erstellungsjahr: desc}"
        )}) {
          ${SCHALTSTELLE_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "schaltstelle",
        featurePrefix: "schaltstelle",
        forSearchType: "schaltstelle",
        logPrefix: "[SCHALTSTELLE_SEARCH]",
        expertSort,
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (effectiveType === "mauerlasche") {
      const whereClause =
        expertWhere ??
        buildMauerlascheWhereClause(values as MauerlascheSearchValues);
      const query = `query MauerlascheSearch {
        mauerlasche(${args(
          whereClause,
          "order_by: {erstellungsjahr: desc}"
        )}) {
          ${MAUERLASCHE_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "mauerlasche",
        featurePrefix: "mauerlaschen",
        forSearchType: "mauerlasche",
        logPrefix: "[MAUERLASCHE_SEARCH]",
        expertSort,
        getGeometry: (item) => {
          const geom = item.geom_84 as { x?: number; y?: number } | undefined;
          if (geom?.x == null || geom?.y == null) return undefined;
          return [geom.x, geom.y];
        },
      });
    } else if (effectiveType === "leitung") {
      // Leitungen have no classic where builder — expertWhere is always set
      // here because the tab is only reachable in expert mode.
      const whereClause = expertWhere ?? "";
      const query = `query LeitungSearch {
        leitung(${args(whereClause, "order_by: {id: desc}")}) {
          ${LEITUNG_FIELDS}
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "leitung",
        featurePrefix: "leitungen",
        forSearchType: "leitung",
        logPrefix: "[LEITUNG_SEARCH]",
        expertSort,
        // Leitungen are line features with no point geom_84; derive a
        // representative WGS84 point from geom.geo_field for fit-to-bounds.
        // The map highlight itself matches by id against the "leitungen"
        // tile layer regardless of this point.
        getGeometry: (item) => leitungPoint(item),
      });
    }
  }, [
    searchType,
    isExpertSearch,
    expertObjectType,
    expertTypeState,
    handleGraphQLSearch,
  ]);

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
            onSearchTypeChange={(type) => {
              setSearchType(type);
              setIsQueryView(false);
            }}
            isExpertSearch={isExpertSearch}
            onExpertSearchChange={(value) => {
              setIsExpertSearch(value);
              setIsQueryView(false);
              // Expert-only tabs (e.g. Leitungen) vanish when leaving expert
              // mode — fall back to a classic tab so no empty view is shown.
              if (!value && EXPERT_ONLY_TYPES.has(searchType)) {
                setSearchType("leuchte");
              }
            }}
            onClose={() => setIsOpen(false)}
            isQueryView={isQueryView}
            showQueryTab={showFinalQuery}
            onSelectQueryTab={() => {
              if (isExpertSearch) {
                // Snapshot the builder so the preview matches what Suchen runs.
                setQueryPreview(
                  generateQueryString(
                    expertObjectType,
                    searchValuesRef.current,
                    buildExpertWhereClause(
                      expertTypeState,
                      REGISTRY[expertObjectType]
                    ),
                    buildExpertOrderBy(
                      expertTypeState,
                      REGISTRY[expertObjectType]
                    ),
                    buildExpertLimit(expertTypeState)
                  )
                );
              }
              setIsQueryView(true);
            }}
          />
        }
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        closable={false}
        footer={
          <div className="flex justify-between items-center pt-3 border-t border-gray-100 -mx-6 px-6">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {isExpertSearch && (
                <button
                  type="button"
                  onClick={() => dispatch(resetType(expertObjectType))}
                  className="text-[#6B7280] hover:text-[#4B5563] bg-transparent border-none cursor-pointer p-0"
                >
                  Zurücksetzen
                </button>
              )}
              {noResults && <span>Keine Ergebnisse gefunden</span>}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
              <Button
                type="primary"
                onClick={executeSearch}
                loading={isSearching}
                disabled={searchDisabled}
              >
                Suchen
              </Button>
            </div>
          </div>
        }
        width={1200}
        centered
        styles={{
          content: { padding: 0, overflow: "hidden" },
          header: { padding: "20px 24px 0", margin: 0 },
          body: { padding: 0 },
          footer: { padding: "0 24px 16px", margin: 0 },
        }}
      >
        <div
          style={{
            height: "min(720px, calc(100vh - 160px))",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              paddingTop: 16,
              paddingLeft: isExpertSearch && !isQueryView ? 0 : 24,
              paddingRight: isExpertSearch && !isQueryView ? 0 : 24,
            }}
          >
            {isQueryView ? (
              <div className="h-full flex flex-col">
                <div className="text-sm font-medium text-gray-500 mb-2">
                  GraphQL Query:
                </div>
                <div className="flex-1 min-h-0">
                  <RawDisplay fill>{queryPreview}</RawDisplay>
                </div>
              </div>
            ) : isExpertSearch ? (
              <ExpertSearch objectType={expertObjectType} />
            ) : (
              renderSearchComponent()
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SearchModal;
