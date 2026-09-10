import { useContext, useEffect, useState } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import { CarmaMap, type LibreLayer } from "@carma-mapping/core";
import {
  LibFuzzySearch,
  defaultTypeInference,
  type GazDataItem,
} from "@carma-mapping/fuzzy-search";
import { useGazData, useSelection } from "@carma-appframeworks/portals";
import { isAreaType } from "@carma-commons/resources";
import { searchTextPlaceholder } from "@carma-collab/wuppertal/vorhabenkarte";

import Menu from "./Menu";

const GLYPHS_URL = "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf";

interface MapProps {
  libreLayers: LibreLayer[];
}

const Map = ({ libreLayers }: MapProps) => {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const [gazDataWithProjects, setGazDataWithProjects] = useState<GazDataItem[]>(
    []
  );
  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useEffect(() => {
    if (gazData && gazData.length > 0 && gazDataWithProjects.length === 0) {
      const gazDataWithFixedProjects = gazData
        .filter((item) => item.type === "vorhabenkarte")
        .map((i) => {
          return {
            ...i,
            modifiedSearchData: i.string.slice(0, 10),
          };
        });

      setGazDataWithProjects([...gazData, ...gazDataWithFixedProjects]);
    }
  }, [gazData]);

  return (
    <CarmaMap
      appKey="VorhabenkarteWuppertal2026"
      mapEngine="maplibre"
      libreLayers={libreLayers}
      overrideGlyphs={GLYPHS_URL}
      terrainControl={false}
      compassControl={false}
      modalMenu={<Menu />}
      gazetteerSearchComponent={
        // data-test-id is what the shared smoke test looks for. CarmaMap only
        // sets it on its own default search, not on an injected one.
        <div data-test-id="fuzzy-search" style={{ marginTop: "4px" }}>
          <LibFuzzySearch
            gazData={gazDataWithProjects}
            typeInference={defaultTypeInference}
            onSelection={onGazetteerSelection}
            priorityTypes={["vorhabenkarte", "adressen", "pois"]}
            placeholder={searchTextPlaceholder}
            pixelwidth={
              responsiveState === "normal" ? "300px" : windowSize.width - gap
            }
            config={{ distance: 300 }}
          />
        </div>
      }
    />
  );
};

export default Map;
