import { useState, useCallback } from "react";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { useSelector } from "react-redux";
import { getStreets } from "../../store/slices/highlight";

const StreetSearch = () => {
  const [searchText, setSearchText] = useState("");
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

  return (
    <div className="flex items-center gap-2">
      <LibFuzzySearch
        pixelwidth="300px"
        placeholder="Adresse..."
        priorityTypes={["adressen"]}
        showDropdownBelow={true}
        onSelection={(hit) => {
          console.log("xxx [StreetSearch] onSelection", hit);
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
