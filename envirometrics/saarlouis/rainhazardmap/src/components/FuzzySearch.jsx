import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext, useEffect, useState } from "react";

const FuzzySearch = ({ gazLocalData }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const [attributionHeight, setAttributionHeight] = useState(0);
  const [bgParam, setBgParam] = useState(
    new URLSearchParams(window.location.search).get("bg")
  );

  const updateBgParam = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const newBg = searchParams.get("bg");
    if (newBg !== bgParam) {
      console.log("xxx newBg :", newBg);
      setBgParam(newBg);
    }
  };

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  // const { gazData } = useGazData();
  const { setSelection } = useSelection();
  useSelectionTopicMap();

  const AREA_TYPE = ["circle", "pie-chart"];

  const isAreaWithOverlay = (selection) => {
    return AREA_TYPE.includes(selection.glyph);
  };
  const ifDesktop = responsiveState === "normal";
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

  const handleHashChange = () => {
    console.log("xxx hash change...");
    const attributionControl = document.querySelector(
      ".leaflet-control-attribution"
    );
    if (attributionControl) {
      const height = attributionControl.getBoundingClientRect().height;
      setAttributionHeight(height);
      console.log("xxx attributionControl", height);
    }
    updateBgParam();
  };

  useEffect(() => {
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);

    const originalPushState = window.history.pushState;
    window.history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event("popstate"));
      return result;
    };

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
      window.history.pushState = originalPushState;
    };
  }, []);

  return (
    <div
      className="custom-left-control"
      style={{
        marginBottom: ifDesktop ? "0" : attributionHeight + 3,
      }}
    >
      <LibFuzzySearch
        gazData={gazLocalData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="Adresssuche"
      />
    </div>
  );
};

export default FuzzySearch;
