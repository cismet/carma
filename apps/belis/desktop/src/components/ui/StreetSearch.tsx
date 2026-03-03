import { useCallback, useState } from "react";
import {
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { GazDataItem } from "@carma-commons/utils";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";

const StreetSearch = ({ gazData }: { gazData?: GazDataItem[] }) => {
  const [searchKey, setSearchKey] = useState(0);
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
    setSearchKey((k) => k + 1);
  }, [setHighlightingActive, clearHighlights]);

  return (
    <div className="flex items-center gap-2">
      <LibFuzzySearch
        key={searchKey}
        hideIcon={true}
        gazData={gazData}
        pixelwidth="300px"
        placeholder="Strassenname | Strassenschlüssel"
        priorityTypes={["adressen"]}
        showDropdownBelow={true}
        onSelection={(selection) => {
          const bounds = selection?.more?.bounds as
            | [number, number, number, number]
            | undefined;

          if (bounds && map) {
            const min = proj4(proj4crs3857def, proj4crs4326def, [
              bounds[0],
              bounds[1],
            ]);
            const max = proj4(proj4crs3857def, proj4crs4326def, [
              bounds[2],
              bounds[3],
            ]);
            map.fitBounds(
              [
                [min[0], min[1]],
                [max[0], max[1]],
              ],
              { padding: 50 }
            );
          } else if (selection?.x && selection?.y && map) {
            const pos = proj4(proj4crs3857def, proj4crs4326def, [
              selection.x,
              selection.y,
            ]);
            map.jumpTo({ center: [pos[0], pos[1]] });
            map.setZoom(14);
          }
          if (selection?.string) {
            const code = String(selection.more.id).padStart(5, "0");
            clearHighlights();
            setHighlightingActive(true);
            highlightByProperty("strassenschluessel", new RegExp(`^${code}$`));
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
