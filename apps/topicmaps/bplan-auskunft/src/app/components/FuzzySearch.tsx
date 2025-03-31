import {
  SelectionMetaData,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { useDispatch } from "react-redux";
import {
  getPlanFeatureByTitle,
  getPlanFeatures,
} from "../../store/slices/bplaene";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import L from "leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import type { UnknownAction } from "redux";

interface FuzzySearchProps {
  setFeatures: (hit) => void;
  setSelectedIndex: (idx) => void;
  onIconClick: () => void;
}

const FuzzySearch = ({
  setFeatures,
  setSelectedIndex,
  onIconClick,
}: FuzzySearchProps) => {
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

  const { gazData } = useGazData();
  const { setSelection } = useSelection();
  useSelectionTopicMap();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      if (
        selection !== undefined &&
        // hits.length === 1 &&
        selection.type === "bplaene"
      ) {
        const gazObject = selection;
        const selectionString = gazObject.string;

        dispatch(
          getPlanFeatureByTitle(selectionString, (hit) => {
            const tmpHit = { ...hit };
            tmpHit.selected = true;
            setFeatures([tmpHit]);
            setSelectedIndex(0);

            const projectedFC = L.Proj.geoJson([tmpHit]);
            const bounds = projectedFC.getBounds();
            const map = routedMapRef?.leafletMap?.leafletElement;
            if (map === undefined) {
              return;
            }
            map.fitBounds(bounds);
          }) as unknown as UnknownAction
        );
      } else if (selection !== undefined) {
        dispatch(
          getPlanFeatures({
            point: { x: selection.x, y: selection.y },
            done: (hits) => {
              if (hits?.length > 0) {
                hits[0].selected = true;
                setFeatures(hits);
                setSelectedIndex(0);
                const projectedFC = L.Proj.geoJson([hits[0]]);
                const bounds = projectedFC.getBounds();
                const map = routedMapRef?.leafletMap?.leafletElement;
                if (map === undefined) {
                  return;
                }
                map.fitBounds(bounds);
              } else {
                setFeatures([]);
              }
            },
          }) as unknown as UnknownAction
        );
      }
    }, 100);
  };
  const searchIcon = (
    <FontAwesomeIcon
      icon={faSearch}
      style={{ fontSize: "16px" }}
      onClick={onIconClick}
    />
  );
  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="B-Plan-Nr. | Adresse | POI"
        icon={searchIcon}
        ifIconDisabled={false}
      />
    </div>
  );
};

export default FuzzySearch;
