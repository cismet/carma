import {
  SelectionMetaData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma-commons/types";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { searchForAEVs } from "../../store/slices/aenderungsverfahren";
import { searchForHauptnutzungen } from "../../store/slices/hauptnutzungen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";

interface FuzzySearchProps {
  mode: string;
  searchTextPlaceholder: string;
  onIconClick: () => void;
  mapSearchAllowed: boolean;
}

const FuzzySearchWrapper = ({
  searchTextPlaceholder,
  mode,
  onIconClick,
  mapSearchAllowed,
}: FuzzySearchProps) => {
  const dispatch = useDispatch();
  let [searchParams, setSearchParams] = useSearchParams();

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

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
      const hits = [selection];
      if (mode === "rechtsplan") {
        dispatch(
          // @ts-expect-error legacy codebase exception
          searchForAEVs({
            gazObject: hits,
            done: (result) => {
              searchParams.set("aevVisible", "true");
              setSearchParams(searchParams);
              const projectedFC = L.Proj.geoJson(result);
              const bounds = projectedFC.getBounds();
              const map = routedMapRef?.leafletMap?.leafletElement;
              if (map === undefined) {
                return;
              }
              map.fitBounds(bounds);
            },
          })
        );
      } else {
        dispatch(
          // @ts-expect-error legacy codebase exception
          searchForHauptnutzungen({
            point: { x: hits[0].x, y: hits[0].y },
            done: (result) => {
              const projectedFC = L.Proj.geoJson(result);
              const bounds = projectedFC.getBounds();
              const map = routedMapRef?.leafletMap?.leafletElement;
              if (map === undefined) {
                return;
              }
              map.fitBounds(bounds);
            },
          })
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
    <>
      <LibFuzzySearch
        onSelection={onGazetteerSelection}
        pixelwidth={
          responsiveState === "normal" ? "300px" : windowSize.width - gap
        }
        ifIconDisabled={!mapSearchAllowed}
        placeholder={searchTextPlaceholder}
        icon={searchIcon}
      />
    </>
  );
};

export default FuzzySearchWrapper;
