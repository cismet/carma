import { useState, useRef, useCallback, useMemo } from "react";
import { Modal, Button, Checkbox } from "antd";
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
  arbeitsauftrag(${
    whereClause ? `${whereClause}, ` : ""
  }order_by: {angelegt_am: desc}) {
    ${AA_SEARCH_FIELDS}
  }
}`;
};

interface ArbeitsauftragSearchModalProps {
  onSearchDone?: () => void;
}

const ArbeitsauftragSearchModal = ({
  onSearchDone,
}: ArbeitsauftragSearchModalProps) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);

  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  // When set, results are loaded into the sidebar/map layer but the map view
  // is left where it is instead of being fitted to the result bounds.
  const [keepMapPosition, setKeepMapPosition] = useState(false);
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
      searchValuesRef.current = values;
      // Editing the criteria clears the message, so the checkbox comes back.
      setNoResults(false);
      if (showRaw) {
        setQueryPreview(generateQueryPreview(values));
      }
    },
    [showRaw]
  );

  const executeSearch = useCallback(() => {
    if (!jwt) {
      return;
    }

    const values = searchValuesRef.current;
    const whereClause = buildArbeitsauftragWhereClause(values);

    const query = `query ArbeitsauftragSearch {
      arbeitsauftrag(${
        whereClause ? `${whereClause}, ` : ""
      }order_by: {angelegt_am: desc}) {
        ${AA_SEARCH_FIELDS}
      }
    }`;

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
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        if (json.errors) {
          console.error("[AA_SEARCH] GraphQL errors:", json.errors);
        }
        const results = json.data?.arbeitsauftrag ?? [];

        if (results.length === 0) {
          setNoResults(true);
          setIsSearching(false);
          return;
        }

        const transformed = transformGqlToTileFeatures(results);

        // Set searchActive BEFORE clearing team to prevent tile extraction from overwriting
        dispatch(setSearchActive(true));
        dispatch(setSelectedTeamId(null));
        dispatch(clearSelection());
        dispatch(setFeatures(transformed));
        // The version bump is what triggers the map's fit-to-results effect.
        if (!keepMapPosition) {
          dispatch(bumpSearchResultsVersion());
        }

        setIsSearching(false);
        setIsOpen(false);
        onSearchDone?.();
      })
      .catch((err) => {
        setIsSearching(false);
      });
  }, [jwt, dispatch, onSearchDone, keepMapPosition]);

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
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {noResults ? (
                <span>Keine Ergebnisse gefunden</span>
              ) : (
                <Checkbox
                  checked={keepMapPosition}
                  onChange={(e) => setKeepMapPosition(e.target.checked)}
                >
                  <span className="text-sm text-gray-500">
                    Kartenposition nicht ändern
                  </span>
                </Checkbox>
              )}
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
