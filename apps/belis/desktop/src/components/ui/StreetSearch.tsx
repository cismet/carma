import { useState, useCallback, useEffect } from "react";
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

  useEffect(() => {
    console.log("xxx streets", streets);
  }, [streets]);

  return (
    <div className="flex items-center gap-2">
      <LibFuzzySearch
        pixelwidth="300px"
        placeholder="Adresse..."
        priorityTypes={["adressen"]}
        showDropdownBelow={true}
        onSelection={(selection) => {
          console.log("xxx [StreetSearch] onSelection", selection);

          const streetsClone = JSON.parse(JSON.stringify(streets));

          if (selection?.string && streetsClone.length > 0) {
            const streetName = selection.string.toUpperCase();
            const match = streetsClone.find(
              ([, name]: [number, string]) =>
                streetName.startsWith(name.toUpperCase())
            );
            if (match) {
              const code = String(match[0]).padStart(5, "0");
              console.log("xxx matched street code:", code, "name:", match[1]);
              clearHighlights();
              setHighlightingActive(true);
              highlightByProperty("strassenschluessel", new RegExp(`^${code}$`));
            }
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
