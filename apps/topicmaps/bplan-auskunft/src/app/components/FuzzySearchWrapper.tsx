import { useContext } from "react";
import { useDispatch } from "react-redux";
import type { UnknownAction } from "redux";
import L from "leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { ManagedProjections } from "@carma/geo/proj";
import { ENDPOINTS, isAreaType } from "@carma/resources";
import type { SearchResultItem } from "@carma/types";
import {
  SelectionMetaData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";

import { getBoundingBoxForLeafletMap } from "@carma-mapping/engines/leaflet";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";

import {
  getPlanFeatureByTitle,
  getPlanFeatures,
} from "../../store/slices/bplaene";

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
      isAreaSelection: isAreaType(selection.type),
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
          ManagedProjections.EPSG25832
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
