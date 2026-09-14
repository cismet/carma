import { useContext, useEffect, useState } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import { CarmaMap } from "@carma-mapping/core";
import {
  useGeoJsonStyleLayer,
  useLibreContext,
  useSelectFeatureById,
  useUrlFeatureSelectionById,
} from "@carma-mapping/engines/maplibre";
import {
  LibFuzzySearch,
  defaultTypeInference,
  type GazDataItem,
} from "@carma-mapping/fuzzy-search";
import {
  MapTitleBox,
  useFeatureItems,
  useGazData,
  useSelection,
} from "@carma-appframeworks/portals";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import {
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/vorhabenkarte";

import Menu from "./Menu";
import { useVorhabenTitle } from "./VorhabenTitle";
import { VORHABEN_SOURCE_ID } from "../../data/vorhabenGeoJson";

const GLYPHS_URL = "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf";

interface MapProps {
  styleUrl: string;
}

const Map = ({ styleUrl }: MapProps) => {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const [gazDataWithProjects, setGazDataWithProjects] = useState<GazDataItem[]>(
    []
  );
  const { gazData } = useGazData();
  const { setSelection } = useSelection();
  const title = useVorhabenTitle();

  // The style from tiles.cismet.de does the rendering; its vector source is
  // swapped for the complete GeoJSON so the app knows every Vorhaben, and the
  // current filter is baked into every style layer.
  const { collection, filterExpression } = useFeatureItems();
  const libreLayers = useGeoJsonStyleLayer({
    name: "Vorhaben",
    styleUrl,
    sourceId: VORHABEN_SOURCE_ID,
    promoteId: "fid",
    collection,
    userFilter: filterExpression,
  });

  // deep link ?tmSelectionObject=<fid>, as useUrlFeatureSelection did before
  const { map } = useLibreContext();
  const selectById = useSelectFeatureById({
    map,
    sourceId: VORHABEN_SOURCE_ID,
    idProperty: "fid",
    collection,
    maxZoom: 17,
  });
  useUrlFeatureSelectionById({
    selectById,
    ready: Boolean(map && collection),
  });

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
    // jump + marker as for every hit
    setSelection(Object.assign({}, selection, selectionMetaData));
    // A Vorhaben hit then zooms onto the item's geometry and selects it
    // (highlight + infobox), as the Leaflet map did with zoomToFeature. The
    // tick lets the selection effect do its jump first, so the zoom wins.
    if (selection.type === ENDPOINT.VORHABEN && selection.more?.id != null) {
      const id = selection.more.id;
      window.setTimeout(() => {
        void selectById(id);
      }, 0);
    }
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
    <>
      <MapTitleBox title={title} />
      <CarmaMap
        appKey="VorhabenkarteWuppertal2026"
        mapEngine="maplibre"
        libreLayers={libreLayers}
        overrideGlyphs={GLYPHS_URL}
        terrainControl={false}
        compassControl={false}
        modalMenu={<Menu />}
        applicationMenuTooltipString={MenuTooltip()}
        gazetteerSearchComponent={
          // LibFuzzySearch carries the data-test-id the smoke test looks for
          <div style={{ marginTop: "4px" }}>
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
    </>
  );
};

export default Map;
