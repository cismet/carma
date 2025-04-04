import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";

const FuzzySearch = ({ gazLocalData }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  // const { gazData } = useGazData();
  const { setSelection } = useSelection();
  useSelectionTopicMap();

  const ifDesktop = responsiveState === "normal";

  const AREA_TYPE = ["circle", "pie-chart"];

  const isAreaWithOverlay = (selection) => {
    return AREA_TYPE.includes(selection.glyph);
  };

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }

    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaWithOverlay(selection),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  return (
    <div
      className="custom-left-control"
      style={{
        marginBottom: ifDesktop ? "0" : "18px",
      }}
    >
      <LibFuzzySearch
        gazData={gazLocalData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="Kommune | Ortslage | Adresse"
      />
    </div>
  );
};

export default FuzzySearch;
