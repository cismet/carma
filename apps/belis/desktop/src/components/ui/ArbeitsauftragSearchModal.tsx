import { useState, useRef, useCallback, useMemo } from "react";
import { Modal, Button } from "antd";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { useSelector, useDispatch } from "react-redux";
import { ArbeitsauftragSearch } from "./featuresSearches";
import { getJWT } from "../../store/slices/auth";
import { ENDPOINT } from "../../constants/belis";
import { transformGqlToTileFeatures } from "../../helper/transformArbeitsauftraege";
import {
  setFeatures,
  setSelectedTeamId,
  setSearchActive,
  clearSelection,
  bumpSearchResultsVersion,
} from "../../store/slices/arbeitsauftraege";
import { buildArbeitsauftragWhereClause } from "../../helper/arbeitsauftragSearchUtils";
import type { ArbeitsauftragSearchValues } from "../../helper/arbeitsauftragSearchUtils";
import type { AppDispatch } from "../../store";
import RawDisplay from "./RawDisplay";

// Full fields matching arbeitsauftraege_by_team query shape.
// Includes arbeitsprotokollstatus.bezeichnung (needed for status classification)
// and geom.geo_field on all entity types (needed for convex hull computation).
const AA_SEARCH_FIELDS = `id
    nummer
    angelegt_am
    angelegt_von
    team {
      id
      name
    }
    ar_protokolleArray {
      arbeitsprotokoll {
        id
        arbeitsprotokollstatus {
          id
          bezeichnung
          schluessel
        }
        geometrie {
          geom {
            geo_field
          }
        }
        tdta_leuchten {
          fk_standort: tdta_standort_mast {
            geom {
              geo_field
            }
          }
        }
        tdta_standort_mast {
          geom {
            geo_field
          }
        }
        schaltstelle {
          geom {
            geo_field
          }
        }
        mauerlasche {
          geom {
            geo_field
          }
        }
        leitung {
          geom {
            geo_field
          }
        }
        abzweigdose {
          geom {
            geo_field
          }
        }
      }
    }`;

const generateQueryPreview = (values: ArbeitsauftragSearchValues): string => {
  const whereClause = buildArbeitsauftragWhereClause(values);
  return `query ArbeitsauftragSearch {
  arbeitsauftrag(${whereClause ? `${whereClause}, ` : ""}order_by: {angelegt_am: desc}) {
    ${AA_SEARCH_FIELDS}
  }
}`;
};

interface ArbeitsauftragSearchModalProps {
  onSearchDone?: () => void;
}

const ArbeitsauftragSearchModal = ({ onSearchDone }: ArbeitsauftragSearchModalProps) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);

  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [queryPreview, setQueryPreview] = useState("");

  const showRaw = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    const param = params.get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  const searchValuesRef = useRef<ArbeitsauftragSearchValues>({});

  const handleValuesChange = useCallback(
    (values: ArbeitsauftragSearchValues) => {
      console.log("yyy [AA_SEARCH] onValuesChange called:", JSON.stringify(values));
      searchValuesRef.current = values;
      if (showRaw) {
        setQueryPreview(generateQueryPreview(values));
      }
    },
    [showRaw]
  );

  const executeSearch = useCallback(() => {
    console.log("yyy [AA_SEARCH] executeSearch called");
    console.log("yyy [AA_SEARCH] jwt present:", !!jwt);
    console.log("yyy [AA_SEARCH] searchValuesRef.current:", JSON.stringify(searchValuesRef.current));

    if (!jwt) {
      console.warn("yyy [AA_SEARCH] No JWT available, please log in first");
      return;
    }

    const values = searchValuesRef.current;
    const whereClause = buildArbeitsauftragWhereClause(values);
    console.log("yyy [AA_SEARCH] whereClause:", whereClause);

    const query = `query ArbeitsauftragSearch {
      arbeitsauftrag(${
        whereClause ? `${whereClause}, ` : ""
      }order_by: {angelegt_am: desc}) {
        ${AA_SEARCH_FIELDS}
      }
    }`;
    console.log("yyy [AA_SEARCH] query:", query);

    setIsSearching(true);
    setNoResults(false);

    console.log("yyy [AA_SEARCH] fetching from:", ENDPOINT);
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ query }),
    })
      .then((res) => {
        console.log("yyy [AA_SEARCH] response status:", res.status);
        return res.json();
      })
      .then((json) => {
        console.log("yyy [AA_SEARCH] raw json:", json);
        if (json.errors) {
          console.error("yyy [AA_SEARCH] GraphQL errors:", json.errors);
        }
        const results = json.data?.arbeitsauftrag ?? [];
        console.log("yyy [AA_SEARCH] result count:", results.length);

        if (results.length === 0) {
          console.log("yyy [AA_SEARCH] no results, showing message");
          setNoResults(true);
          setIsSearching(false);
          return;
        }

        console.log("yyy [AA_SEARCH] first result sample:", JSON.stringify(results[0]).substring(0, 500));
        const transformed = transformGqlToTileFeatures(results);
        console.log("yyy [AA_SEARCH] transformed count:", transformed.length);
        console.log("yyy [AA_SEARCH] first transformed:", JSON.stringify(transformed[0]));

        // Set searchActive BEFORE clearing team to prevent tile extraction from overwriting
        dispatch(setSearchActive(true));
        dispatch(setSelectedTeamId(null));
        dispatch(clearSelection());
        dispatch(setFeatures(transformed));
        dispatch(bumpSearchResultsVersion());
        console.log("yyy [AA_SEARCH] dispatched setSearchActive + setSelectedTeamId(null) + setFeatures");

        setIsSearching(false);
        setIsOpen(false);
        onSearchDone?.();
      })
      .catch((err) => {
        console.error("yyy [AA_SEARCH] fetch error:", err);
        setIsSearching(false);
      });
  }, [jwt, dispatch, onSearchDone]);

  return (
    <>
      <Icon
        icon={faFilter}
        onClick={() => setIsOpen(true)}
        title="Arbeitsaufträge suchen"
        className="text-blue-600 cursor-pointer hover:text-blue-800"
      />

      <Modal
        title="Arbeitsaufträge suchen"
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
            height: showRaw
              ? "min(400px, calc(100vh - 450px))"
              : "min(640px, calc(100vh - 250px))",
            overflowY: "auto",
            paddingRight: 8,
          }}
        >
          <ArbeitsauftragSearch onValuesChange={handleValuesChange} />
        </div>
        {showRaw && (
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

export default ArbeitsauftragSearchModal;
