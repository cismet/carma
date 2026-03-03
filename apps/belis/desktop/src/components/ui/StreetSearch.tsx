import { useCallback } from "react";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { GazDataItem } from "@carma-commons/utils";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";

const StreetSearch = ({ gazData }: { gazData?: GazDataItem[] }) => {
  const { map } = useLibreContext();
  const {
    highlightingActive,
    setHighlightingActive,
    highlightByProperty,
    clearHighlights,
  } = useMapHighlight();

  const handleClear = useCallback(() => {
    setHighlightingActive(false);
    clearHighlights();
  }, [setHighlightingActive, clearHighlights]);

  return (
    <div className="flex items-center gap-2">
      <LibFuzzySearch
        gazData={gazData}
        pixelwidth="300px"
        placeholder="Adresse..."
        priorityTypes={["adressen"]}
        showDropdownBelow={true}
        onSelection={(selection) => {
          if (selection?.x && selection?.y && map) {
            const pos = proj4(proj4crs3857def, proj4crs4326def, [
              selection.x,
              selection.y,
            ]);
            map.jumpTo({ center: [pos[0], pos[1]] });
            map.setZoom(14);
          }

          if (selection?.more?.id) {
            const code = String(selection.more.id).padStart(5, "0");
            clearHighlights();
            setHighlightingActive(true);
            highlightByProperty(
              "strassenschluessel",
              new RegExp(`^${code}$`)
            );
          }
        }}
      />
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
