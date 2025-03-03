import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { FeatureCollectionDisplayWithTooltipLabels } from "react-cismap";
import BPlanInfo from "./BPlanInfo";
import { bplanFeatureStyler, bplanLabeler } from "../../utils/styler";
import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getLoading,
  getPlanFeatureByTitle,
  getPlanFeatures,
  loadBPlaene,
} from "../../store/slices/bplaene";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import { getGazData } from "../../utils/gazData";
import GazetteerSearchControl from "react-cismap/GazetteerSearchControl";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "@carma-collab/wuppertal/bplan-auskunft";
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import type { UnknownAction } from "redux";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { Layer } from "leaflet";
import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
  SearchResultItem,
} from "@carma-mapping/fuzzy-search";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

const Map = () => {
  const dispatch = useDispatch();
  const isLoading = useSelector(getLoading);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [boundingBox, setBoundingBox] = useState(null);
  // const [gazData, setGazData] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  let refRoutedMap = useRef(null);
  const zoom = searchParams.get("zoom");
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

  interface MapFeature extends Layer {
    id: string;
    selected: boolean;
    feature?: {
      id: string;
      selected: boolean;
    };
  }

  const featureClick = (event) => {
    if (event.target.feature.selected) {
      const projectedFC = L.Proj.geoJson(event.target.feature);
      const bounds = projectedFC.getBounds();
      const map = routedMapRef?.leafletMap?.leafletElement;
      if (map === undefined) {
        return;
      }
      map.fitBounds(bounds);
    } else {
      console.log("features", features, event.target.feature);

      const index = features.findIndex(
        (element) => element.feature?.id === event.target.feature.id
      );
      if (index !== -1) {
        setSelectedIndex(index);
        features.forEach((element) => {
          if (element.feature) {
            element.feature.selected = false;
          }
        });
        event.target.feature.selected = true;
      }
    }
  };

  const mapClick = (event) => {
    if (event.target.feature === undefined) {
      const projectedFC = new L.FeatureGroup();
      features.forEach((feature) => {
        projectedFC.addLayer(feature);
      });

      const bounds = projectedFC.getBounds();
      const map = routedMapRef?.leafletMap?.leafletElement;
      if (map === undefined) {
        return;
      }
      map.fitBounds(bounds);
    } else {
      console.log("features", features, event.target.feature);

      const index = features.findIndex(
        (element) => element.feature?.id === event.target.feature.id
      );
      if (index !== -1) {
        setSelectedIndex(index);
        features.forEach((element) => {
          if (element.feature) {
            element.feature.selected = false;
          }
        });
        event.target.feature.selected = true;
      }
    }
  };

  const doubleMapClick = (event) => {
    const pos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      [event.latlng.lng, event.latlng.lat]
    );

    dispatch(
      getPlanFeatures({
        point: { x: pos[0], y: pos[1] },
        done: (hits) => {
          if (hits?.length > 0) {
            hits[0].selected = true;
            setFeatures(hits);
            setSelectedIndex(0);
          } else {
            setFeatures([]);
          }
        },
      }) as unknown as UnknownAction
    );
  };

  const bplanSearchButtonHit = (event) => {
    dispatch(
      getPlanFeatures({
        boundingBox: boundingBox,
        done: (hits) => {
          hits[0].selected = true;
          setFeatures(hits);
          setSelectedIndex(0);
        },
      }) as unknown as UnknownAction
    );
  };

  useEffect(() => {
    dispatch(loadBPlaene() as unknown as UnknownAction);
    // getGazData(setGazData);
    document.title = `B-Plan-Auskunft Wuppertal`;
  }, []);

  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

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
        const selectionString = gazObject?.more?.v || gazObject.string;

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

  return (
    <>
      <TopicMapComponent
        initialLoadingText="Laden der B-Plan-Daten"
        fullScreenControl
        pendingLoader={isLoading ? 1 : 0}
        locatorControl
        ref={refRoutedMap}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        backgroundlayers={"uwBPlan|rvrGrundriss@20"}
        // backgroundlayers={"bplan_abkg|rvrGrundriss@20"}
        modalMenu={<Modal version={getApplicationVersion(versionData)} />}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(searchParams), ...location };
          setSearchParams(newParams);
        }}
        infoBox={
          <BPlanInfo
            pixelwidth={350}
            features={features}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            setFeatures={setFeatures}
          />
        }
        applicationMenuTooltipString="Kompaktanleitung anzeigen"
        ondblclick={doubleMapClick}
        homeZoom={16}
        applicationMenuIconname="info"
        mappingBoundsChanged={(bbox) => {
          setBoundingBox(bbox);
        }}
        // gazetteerSearchControlProps={{
        //   tertiaryAction: bplanSearchButtonHit,
        //   tertiaryActionIcon: faSearch,
        //   tertiaryActionTooltip: "B-Pläne suchen",
        //   teriaryActionDisabled: Number(zoom) < 13,
        // }}
        // gazetteerSearchPlaceholder="B-Plan-Nr. | Adresse | POI"
        // gazetteerHitTrigger={(hits) => {
        //   if (
        //     hits !== undefined &&
        //     hits.length === 1 &&
        //     hits[0].type === "bplaene"
        //   ) {
        //     const gazObject = hits[0];
        //     const selectionString = gazObject?.more?.v || gazObject.string;

        //     dispatch(
        //       getPlanFeatureByTitle(selectionString, (hit) => {
        //         const tmpHit = { ...hit };
        //         tmpHit.selected = true;
        //         setFeatures([tmpHit]);
        //         setSelectedIndex(0);

        //         const projectedFC = L.Proj.geoJson([tmpHit]);
        //         const bounds = projectedFC.getBounds();
        //         const map = routedMapRef?.leafletMap?.leafletElement;
        //         if (map === undefined) {
        //           return;
        //         }
        //         map.fitBounds(bounds);
        //       }) as unknown as UnknownAction
        //     );
        //   } else if (hits !== undefined && hits.length > 0) {
        //     dispatch(
        //       getPlanFeatures({
        //         point: { x: hits[0].x, y: hits[0].y },
        //         done: (hits) => {
        //           if (hits?.length > 0) {
        //             hits[0].selected = true;
        //             setFeatures(hits);
        //             setSelectedIndex(0);
        //             const projectedFC = L.Proj.geoJson([hits[0]]);
        //             const bounds = projectedFC.getBounds();
        //             const map = routedMapRef?.leafletMap?.leafletElement;
        //             if (map === undefined) {
        //               return;
        //             }
        //             map.fitBounds(bounds);
        //           } else {
        //             setFeatures([]);
        //           }
        //         },
        //       }) as unknown as UnknownAction
        //     );
        //   }
        // }}
        // gazData={gazData}
      >
        <TopicMapSelectionContent />

        <FeatureCollectionDisplayWithTooltipLabels
          key={"fc" + selectedIndex}
          featureCollection={features}
          style={bplanFeatureStyler}
          labeler={bplanLabeler}
          featureClickHandler={featureClick}
        />
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          pixelwidth={pixelwidth}
          placeholder="B-Plan-Nr. | Adresse | POI"
        />
      </div>
    </>
  );
};

export default Map;
