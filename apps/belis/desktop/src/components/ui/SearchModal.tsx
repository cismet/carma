import { useState, useEffect, useCallback, useRef } from "react";
import { Modal, Button, Segmented } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { useSelector } from "react-redux";
import { LeuchteSearch, MastSearch } from "./featuresSearches";
import { getJWT } from "../../store/slices/auth";
import { ENDPOINT } from "../../constants/belis";
import { getFromUTM32ToWGS84 } from "@carma/geo/proj";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";

type SearchType = "leuchte" | "mast";

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

type SearchValues = LeuchteSearchValues | MastSearchValues;

const searchTypeLabels: Record<SearchType, string> = {
  leuchte: "Leuchte",
  mast: "Mast",
};

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
    parts.push(`_lte: "${bis.split("T")[0]}"`);
  }
  return parts.length > 0 ? `${fieldName}: {${parts.join(", ")}}` : null;
};

// Build GraphQL where clause from search values
const buildLeuchteWhereClause = (values: LeuchteSearchValues): string => {
  const conditions: string[] = [];

  // Date range conditions (combined into single objects)
  const inbetriebnahmeCondition = buildDateRangeCondition(
    "inbetriebnahme_leuchte",
    values.inbetriebnahmeLeuchte?.von,
    values.inbetriebnahmeLeuchte?.bis
  );
  if (inbetriebnahmeCondition) {
    conditions.push(inbetriebnahmeCondition);
  }

  // Wechseldatum needs nested structure
  if (values.wechseldatumLeuchtmittel?.von || values.wechseldatumLeuchtmittel?.bis) {
    const datumParts: string[] = [];
    if (values.wechseldatumLeuchtmittel?.von) {
      datumParts.push(`_gte: "${values.wechseldatumLeuchtmittel.von.split("T")[0]}"`);
    }
    if (values.wechseldatumLeuchtmittel?.bis) {
      datumParts.push(`_lte: "${values.wechseldatumLeuchtmittel.bis.split("T")[0]}"`);
    }
    conditions.push(`wpiw_leuchtmittelwechsel: {wechsel: {datum: {${datumParts.join(", ")}}}}`);
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
    conditions.push(`fk_anlagengruppe: {_eq: ${values.anlagengruppe.value}}`);
  }
  if (values.unterhaltMast?.value) {
    conditions.push(`fk_unterhalt_mast: {_eq: ${values.unterhaltMast.value}}`);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};

// Helper to generate query string for preview
const generateQueryString = (
  searchType: SearchType,
  values: SearchValues
): string => {
  if (searchType === "leuchte") {
    const whereClause = buildLeuchteWhereClause(values as LeuchteSearchValues);
    return `query LeuchtenSearch {
  tdta_leuchten(limit: 500${whereClause ? `, ${whereClause}` : ""}, order_by: {einbaudatum: desc}) {
    id
    tdta_standort_mast {
      geom {
        geo_field
      }
    }
  }
}`;
  } else {
    const whereClause = buildMastWhereClause(values as MastSearchValues);
    return `query MastSearch {
  tdta_standort_mast(limit: 500${whereClause ? `, ${whereClause}` : ""}, order_by: {inbetriebnahme_mast: desc}) {
    id
    geom {
      geo_field
    }
  }
}`;
  }
};

const SearchModal = ({
  defaultOpen = false,
  showFinalQuery = false,
}: SearchModalProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchType, setSearchType] = useState<SearchType>("leuchte");
  const [isSearching, setIsSearching] = useState(false);
  const [queryPreview, setQueryPreview] = useState<string>("");

  const jwt = useSelector(getJWT);
  const { map } = useLibreContext();
  const { setHighlightingActive, highlightByIds, clearHighlights } =
    useMapHighlight();

  // Store current search values
  const searchValuesRef = useRef<SearchValues>({});

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

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
      logPrefix?: string;
    }) => {
      const {
        query,
        dataKey,
        featurePrefix,
        getGeometry,
        logPrefix = "[SEARCH]",
      } = options;

      if (!jwt) {
        console.warn(`${logPrefix} No JWT available, please log in first`);
        return;
      }

      setIsSearching(true);
      console.log(`xxx ${logPrefix} Fetching data...`);
      console.log(`xxx ${logPrefix} Query:`, query);

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
          console.log(`xxx ${logPrefix} Raw result:`, json);
          const results = json.data?.[dataKey] ?? [];
          console.log(`xxx ${logPrefix} Result count:`, results.length);

          if (results.length === 0) {
            console.warn(`xxx ${logPrefix} No results found`);
            setIsSearching(false);
            return;
          }

          const coords = results
            .map((item: Record<string, unknown>) => {
              const utm = getGeometry(item);
              if (!utm) return undefined;
              return getFromUTM32ToWGS84(utm) as [number, number];
            })
            .filter(Boolean) as [number, number][];

          if (coords.length === 0) {
            console.warn(`${logPrefix} No coordinates found`);
            setIsSearching(false);
            return;
          }

          const bbox = {
            minLng: Math.min(...coords.map((c) => c[0])),
            maxLng: Math.max(...coords.map((c) => c[0])),
            minLat: Math.min(...coords.map((c) => c[1])),
            maxLat: Math.max(...coords.map((c) => c[1])),
          };
          console.log(`${logPrefix} BBox:`, bbox);
          console.log(`${logPrefix} Coordinates:`, coords);

          // Highlight the returned features on the map
          const ids = results
            .map((item: Record<string, unknown>) => String(item.id))
            .filter(Boolean);
          clearHighlights();
          setHighlightingActive(true);
          const highlightArray = ids.map(
            (id: string) => `${featurePrefix}:${id}`
          );

          highlightByIds(highlightArray);
          console.log(`${logPrefix} Highlighted`, ids.length, "features");
          console.log(`${logPrefix} Highlight Array`, highlightArray);

          if (map) {
            map.fitBounds(
              [
                [bbox.minLng, bbox.minLat],
                [bbox.maxLng, bbox.maxLat],
              ],
              { padding: 50 }
            );
            console.log(`${logPrefix} Map fitted to bounds`);
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

    if (searchType === "leuchte") {
      const whereClause = buildLeuchteWhereClause(
        values as LeuchteSearchValues
      );
      const query = `query LeuchtenSearch {
        tdta_leuchten(limit: 500${
          whereClause ? `, ${whereClause}` : ""
        }, order_by: {einbaudatum: desc}) {
          id
          tdta_standort_mast {
            geom {
              geo_field
            }
          }
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
          const geom = mast?.geom as Record<string, unknown> | undefined;
          const geoField = geom?.geo_field as
            | { coordinates?: [number, number] }
            | undefined;
          return geoField?.coordinates;
        },
      });
    } else if (searchType === "mast") {
      const whereClause = buildMastWhereClause(values as MastSearchValues);
      const query = `query MastSearch {
        tdta_standort_mast(limit: 500${
          whereClause ? `, ${whereClause}` : ""
        }, order_by: {inbetriebnahme_mast: desc}) {
          id
          geom {
            geo_field
          }
        }
      }`;

      handleGraphQLSearch({
        query,
        dataKey: "tdta_standort_mast",
        featurePrefix: "masten",
        logPrefix: "[MAST_SEARCH]",
        getGeometry: (item) => {
          const geom = item.geom as Record<string, unknown> | undefined;
          const geoField = geom?.geo_field as
            | { coordinates?: [number, number] }
            | undefined;
          return geoField?.coordinates;
        },
      });
    }
  }, [searchType, handleGraphQLSearch]);

  const renderSearchComponent = () => {
    switch (searchType) {
      case "mast":
        return <MastSearch onValuesChange={handleValuesChange} />;
      case "leuchte":
      default:
        return <LeuchteSearch onValuesChange={handleValuesChange} />;
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
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Button
              type="primary"
              onClick={executeSearch}
              loading={isSearching}
            >
              Suchen
            </Button>
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
            <pre
              className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto"
              style={{ maxHeight: "200px" }}
            >
              {queryPreview}
            </pre>
          </div>
        )}
      </Modal>
    </>
  );
};

export default SearchModal;
