import { useState, useCallback, useEffect } from "react";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../store/slices/keyTables";
import { getStreets, StreetWithCode } from "../../store/slices/highlight";

const StreetSearch = () => {
  const [searchText, setSearchText] = useState("");
  const keyTablesData = useSelector(getKeyTablesData);
  const streets = useSelector(getStreets);
  const { map } = useLibreContext();
  const {
    highlightingActive,
    setHighlightingActive,
    highlightByProperty,
    clearHighlights,
  } = useMapHighlight();

  const handleSearch = useCallback(() => {
    if (!map || !searchText.trim()) return;
    clearHighlights();
    setHighlightingActive(true);
    highlightByProperty(
      "strassenschluessel",
      new RegExp(searchText.trim(), "i")
    );
  }, [
    map,
    searchText,
    setHighlightingActive,
    highlightByProperty,
    clearHighlights,
  ]);

  const handleClear = useCallback(() => {
    setHighlightingActive(false);
    clearHighlights();
    setSearchText("");
  }, [setHighlightingActive, clearHighlights]);

  // useEffect(() => {
  //   console.log("xxx keyTablesData", keyTablesData);
  // }, [keyTablesData]);

  return (
    <div className="flex items-center gap-2">
      <LibFuzzySearch
        pixelwidth="300px"
        placeholder="Adresse..."
        priorityTypes={["adressen"]}
        showDropdownBelow={true}
        onSelection={(hit) => {
          console.log("xxx [StreetSearch] onSelection", hit);

          if (hit?.string && streets) {
            console.log("xxx 1111111");
            // const match = streets.filter(
            //   (s) => s.strasse.toUpperCase() === hit.string.toUpperCase()
            // );
            // console.log(
            //   "xxx streetName:",
            //   match[0],
            //   "match:",
            //   match,
            //   "pk:",
            //   match[0]?.pk
            // );
          }
        }}
      />
      {/* <button
        onClick={handleSearch}
        disabled={!searchText.trim()}
        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        Suche
      </button> */}
      {highlightingActive && (
        <button
          onClick={handleClear}
          className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
        >
          {"\u2715"}
        </button>
      )}
    </div>
  );
};

export default StreetSearch;
