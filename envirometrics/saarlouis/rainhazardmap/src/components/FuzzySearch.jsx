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
  const hash = window.location.hash; // e.g. "#/?bg=2&lat=52.34..."
  const queryString = hash.split("?")[1];
  const [bgParam, setBgParam] = useState(
    new URLSearchParams(queryString).get("bg")
  );

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

  const calculateGab = () => {
    setTimeout(() => {
      const attributionControl = document.querySelector(
        ".leaflet-control-attribution"
      );
      if (attributionControl) {
        const height = attributionControl.getBoundingClientRect().height;
        attributionControl.style.marginLeft = "16px";
        setAttributionHeight(height);
        console.log("xxx attributionControl", height);
      } else {
        setAttributionHeight(0);
      }
    }, 50);
  };

  const buildBottomGap = () => {
    const hash = window.location.hash;
    const queryString = hash.split("?")[1];
    const searchParams = new URLSearchParams(queryString);
    const newBg = searchParams.get("bg");
    console.log("xxx newBg", newBg);
    console.log("xxx bgParam", bgParam);
    if (newBg !== bgParam) {
      calculateGab();
    }
    setBgParam(newBg);
  };

  useEffect(() => {
    calculateGab();
    window.addEventListener("popstate", buildBottomGap);

    const originalPushState = window.history.pushState;
    window.history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event("popstate"));
      return result;
    };

    return () => {
      window.removeEventListener("popstate", buildBottomGap);
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
