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
import {
  getPlanFeatureByTitle,
  getPlanFeatures,
} from "../../store/slices/bplaene";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import L from "leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import type { UnknownAction } from "redux";
import { getBoundingBoxForLeafletMap } from "@carma-mapping/utils";
import proj4 from "proj4";
interface FuzzySearchProps {
  setFeatures: (hit) => void;
  setSelectedIndex: (idx) => void;
  onIconClick: () => void;
  mapSearchAllowed: boolean;
}

const FuzzySearchWrapper = ({
  setFeatures,
  setSelectedIndex,
  onIconClick,
  mapSearchAllowed,
}: FuzzySearchProps) => {
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

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
      } else if (
        selection !== undefined &&
        selection?.more?.g?.type !== "Polygon"
      ) {
        const boundingBox = getBoundingBoxForLeafletMap(
          routedMapRef?.leafletMap,
          proj4.defs("EPSG:25832")
        );
        dispatch(
          getPlanFeatures({
            point: { x: selection.x, y: selection.y },
            done: (hits) => {
              if (hits?.length === 0) {
                dispatch(
                  getPlanFeatures({
                    boundingBox: boundingBox,
                    done: (hits) => {
                      if (hits?.length === 0) {
                      } else {
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
                          //map.fitBounds(bounds);
                        } else {
                          setFeatures([]);
                        }
                      }
                    },
                  }) as unknown as UnknownAction
                );
              } else {
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
    <LibFuzzySearch
      onSelection={onGazetteerSelection}
      pixelwidth={
        responsiveState === "normal" ? "300px" : windowSize.width - gap
      }
      placeholder="B-Plan-Nr. | Adresse | POI"
      icon={searchIcon}
      ifIconDisabled={!mapSearchAllowed}
    />
  );
};

export default FuzzySearchWrapper;
