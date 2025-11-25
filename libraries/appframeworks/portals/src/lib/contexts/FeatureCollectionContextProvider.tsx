import { useImmer } from "use-immer";
import React, { useEffect, useContext, useRef } from "react";
import KDBush from "kdbush";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "./TopicMapContextProvider";
import bboxPolygon from "@turf/bbox-polygon";
import localforage from "localforage";
import proj4 from "proj4";
import envelope from "@turf/envelope";
import { featureCollection } from "@turf/helpers";
import center from "@turf/center";
import { setFromLocalforage } from "../utils/utils";
import { createFlatbushIndex, findInFlatbush } from "../utils/gisHelper";
import { projectionData } from "../utils/constants";
import { md5FetchJSON } from "@carma-commons/utils";
import { fetchJSON } from "react-cismap/tools/fetching";
// import { fetchJSON, md5FetchJSON } from "@carma-commons/utils/fetching.ts";
const defaultState = {
  items: undefined,
  itemsDictionary: undefined,
  createItemsDictionary: () => {},
  metaInformation: undefined,
  filteredItems: undefined,
  filterState: undefined,
  filterMode: undefined,
  itemFilterFunction: undefined,
  filterFunction: undefined,
  allFeatures: undefined,
  pointFeatures: undefined,
  otherFeatures: undefined,
  shownFeatures: undefined,
  selectedFeature: undefined,
  secondarySelection: undefined,
  pointFeatureIndex: undefined,
  polyFeatureIndex: undefined,
  featureTooltipFunction: undefined,
  selectedIndexState: {
    selectedIndex: 0,
    forced: false,
  },
  clusteringEnabled: false,
  clusteringOptions: undefined,
  classKeyFunction: undefined,
  getColorFromProperties: undefined,
  epsgCode: undefined,
  initializingFeatures: false,
};

const StateContext = React.createContext(defaultState);
const DispatchContext = React.createContext(defaultState);

const getItems = async ({
  setItems,
  itemsUrl,
  convertItemToFeature,
  name = "cachedFeatureCollection",
  caching = true,
  withMD5Check = true,
}) => {
  const prefix = name;
  let items;

  if (caching === true && withMD5Check === true) {
    items = await md5FetchJSON(prefix, itemsUrl);
  } else {
    // else if () {
    //     //need to impl the other stuff
    // }
    items = await fetchJSON(itemsUrl);
  }
  setItems(items);
};

const FeatureCollectionContextProvider = ({
  children,
  enabled = true,
  getFeatureStyler,
  getColorFromProperties,
  getSymbolSVG,
  clusteringEnabled = false,
  clusteringOptions,
  alwaysShowAllFeatures = false,
  itemsURL,
  items,
  featureCollectionName,
  featureTooltipFunction,
  convertItemToFeature = (itemIsFeature) =>
    JSON.parse(JSON.stringify(itemIsFeature || {})),
  convertItemToFeatureProgressCallback = () => {},
  convertItemToFeatureProgressCallbackPercentageSteps = 5,
  itemFilterFunction,
  filterFunction,
  appKey,
  persistenceSettings,
  filterState,
  classKeyFunction,
  createItemsDictionary = () => {},
  nextFeature,
  prevFeature,
  deriveSecondarySelection,
}) => {
  const [state, dispatch] = useImmer({
    ...defaultState,
    items,
    getFeatureStyler,
    getColorFromProperties,
    clusteringEnabled,
    clusteringOptions,
    getSymbolSVG,
    itemFilterFunction,
    filterFunction,
    filterState,
    classKeyFunction,
    featureTooltipFunction,
    createItemsDictionary,
  });

  const { boundingBox, mapEPSGCode, appMode } = useContext(TopicMapContext);
  const { fitBBox } = useContext(TopicMapDispatchContext);
  const contextKey = "featureCollection";
  const set = (prop, noTest) => {
    return (x) => {
      dispatch((state) => {
        if (
          noTest === true ||
          JSON.stringify(state[prop]) !== JSON.stringify(x)
        ) {
          // console.log("xxx will set " + prop, x, contextKey, persistenceSettings[contextKey]);
          if (persistenceSettings[contextKey]?.includes(prop)) {
            // (async () => {
            localforage.setItem(
              "@" + appKey + "." + contextKey + "." + prop,
              x
            );
            // })();
          }
          // console.log("will set " + prop, x, { stacktrace: new Error().stack.split("\n") });
          state[prop] = x;
        }
      });
    };
  };
  useEffect(() => {
    if (persistenceSettings && persistenceSettings[contextKey]) {
      for (const prop of persistenceSettings[contextKey]) {
        const localforagekey = "@" + appKey + "." + contextKey + "." + prop;
        const setter = set(prop, true);
        setFromLocalforage(localforagekey, setter);
      }
    }
  }, []);
  const {
    pointFeatureIndex,
    polyFeatureIndex,
    allFeatures,
    pointFeatures,
    otherFeatures,
    shownFeatures,
    selectedIndexState,
    selectedFeature,
  } = state;

  const selectedIndex = selectedIndexState.selectedIndex;

  const setX = {
    setItems: (items) => {
      set("itemsDictionary")(createItemsDictionary(items));
      set("items")(items);
    },
    setMetaInformation: set("metaInformation"),
    setEPSGCode: set("epsgCode"),
    setFilteredItems: set("filteredItems"),
    setFilterState: set("filterState"),
    setFilterMode: set("filterMode"),
    setFilterFunction: set("filterFunction"),
    setItemFilterFunction: set("itemFilterFunction"),
    setAllFeatures: set("allFeatures"),
    setPointFeatures: set("pointFeatures"),
    setOtherFeatures: set("otherFeatures"),
    setShownFeatures: set("shownFeatures"),
    // setSelectedFeature: set("selectedFeature"), //don't set this directly, use setSelectedIndex
    setPointFeatureIndex: set("pointFeatureIndex"),
    setPolyFeatureIndex: set("polyFeatureIndex"),
    setSelectedIndexState: set("selectedIndexState"),
    setClusteringEnabled: set("clusteringEnabled"),
    setFeatureTooltipFunction: set("featureTooltipFunction"),
    setClusteringOptions: set("clusteringOptions"),
    setGetFeatureStyler: set("getFeatureStyler"),
    setGetColorFromProperties: set("getColorFromProperties"),
  };

  const setSelectedFeatureIndex = (selectedIndex) => {
    setX.setSelectedIndexState({ selectedIndex, forced: true }); //overrules keep index when boundingbox is changed
  };

  const setSelectedIndex = (selectedIndex) => {
    setX.setSelectedIndexState({ selectedIndex, forced: false });
  };

  const _setSelectedFeatureByPredicate = (predicate, feedbacker = () => {}) => {
    const { shownFeatures } = state.curent; // Access the current state directly

    let index = 0;
    console.log("will check in showFeatures:", shownFeatures);

    for (const feature of shownFeatures) {
      // console.log("xxx predicate loop. will check ", feature.properties.id);
      if (predicate(feature) === true) {
        // console.log("xxx predicate hit. will select ", index);
        setSelectedFeatureIndex(index); // Call setSelectedFeatureIndex outside the dispatch function
        // console.log("xxx predicate hit. after setSelectedIndex", index);
        feedbacker(true);
        return;
      }
      index++;
    }
    // console.log("xxx setSelectedFeatureByPredicate",  "nothing found");
    feedbacker(false);
  };

  const setSelectedFeatureByPredicate = (predicate, feedbacker = () => {}) => {
    dispatch((draft) => {
      let index = 0;
      // console.log("will check in showFeatures:", draft.shownFeatures);

      for (const feature of draft.shownFeatures) {
        if (predicate(feature) === true) {
          // console.log("xxx predicate hit. will select ", index);
          draft.selectedIndexState = {
            ...draft.selectedIndexState,
            selectedIndex: index,
            forced: true,
          };
          // console.log("xxx predicate hit. after setSelectedIndex", index);
          feedbacker(true);
          return;
        }
        index++;
      }
      feedbacker(false);
    });
  };

  const fitBoundsForCollection = (featuresToZoomTo) => {
    dispatch((state) => {
      let fc = featuresToZoomTo || state.allFeatures;
      if (fc.length > 0) {
        let refDef;
        //find out crs
        if (Array.isArray(fc) && fc.length > 0) {
          const firstFeature = fc[0];
          const code = firstFeature?.crs?.properties?.name?.split("EPSG::")[1];
          refDef = projectionData[code].def;
        }

        let bbox = envelope(featureCollection(fc)).bbox;
        fitBBox(bbox, refDef);
      } else {
        // in case no feature is in the allFeatures collection (filtersettings)
        // then zoom to the beautiful city of wuppertal
        const bbox = [365438.691, 5673053.061, 381452.618, 5682901.164];
        fitBBox(bbox, projectionData[25832].def);
      }
    });
  };

  const getSelectableCount = () => {
    return (
      shownFeatures.length -
      shownFeatures.filter((f) => f.properties.preventSelection).length
    );
  };

  const nextIndex = (currentIndex) => {
    const newIndex = currentIndex + (1 % shownFeatures.length);
    if (shownFeatures[newIndex]?.preventSelection === true) {
      return nextIndex(newIndex);
    } else {
      return newIndex;
    }
  };

  const prevIndex = (currentIndex) => {
    let newIndex = currentIndex - (1 % shownFeatures.length);
    if (newIndex === -1) {
      newIndex = shownFeatures.length - 1;
    }
    if (shownFeatures[newIndex]?.preventSelection === true) {
      return prevIndex(newIndex);
    } else {
      return newIndex;
    }
  };
  const next = () => {
    setSelectedFeatureIndex(nextIndex(selectedFeature.index));
  };

  const prev = () => {
    setSelectedFeatureIndex(prevIndex(selectedFeature.index));
  };

  useEffect(() => {
    if (state.allFeatures?.length > 0) {
      const first = state.allFeatures[0];
      const epsgCode = first.crs.properties.name.split(
        "urn:ogc:def:crs:EPSG::"
      )[1];
      setX.setEPSGCode(epsgCode);
    }
  }, [state.allFeatures]);

  const getFirstSelectableFeatureIndex = () => {
    let index = 0;
    for (const feature of state?.shownFeatures || []) {
      if (feature.properties.preventSelection !== true) {
        return index;
      }
      index++;
    }
    return -1;
  };
  // if (state?.items) {
  //   console.log("FeatureCollectionContextProvider items", state?.items);
  //   console.log("xxx FeatureCollectionContextProvider items", state?.shownFeatures);
  // }
  // effect when items are changed
  useEffect(() => {
    //async start
    (async () => {
      if (state.filteredItems) {
        console.log("xxx", state.filteredItems);
        set("initializingFeatures")(true);

        const points = [];
        const others = [];
        let current = 0;
        let id = 0;

        // Calculate at which items we should fire callbacks
        const totalItems = state.filteredItems.length;
        const stepSize = Math.floor(
          totalItems *
            (convertItemToFeatureProgressCallbackPercentageSteps / 100)
        );

        // Initial progress callback
        convertItemToFeatureProgressCallback({
          current: 0,
          total: 100,
          inProgress: true,
        });

        for (const item of state.filteredItems || []) {
          const f = await convertItemToFeature(item);
          // check if it is an array of features
          const doFeature = (f) => {
            f.selected = false;
            f.id = id++;
            if (f?.geometry?.type === "Point") {
              points.push(f);
            } else {
              others.push(f);
            }
            return f;
          };

          if (Array.isArray(f)) {
            for (const subfeature of f) {
              doFeature(subfeature);
            }
          } else {
            doFeature(f);
          }

          // Fire callback at specific intervals
          if (stepSize > 0 && current > 0 && current % stepSize === 0) {
            const progressPercentage = Math.floor((current / totalItems) * 100);
            convertItemToFeatureProgressCallback({
              current: progressPercentage,
              total: 100,
              inProgress: true,
            });
          }
          current++;
        }

        setX.setAllFeatures([...points, ...others]);
        setX.setPointFeatures(points);
        setX.setOtherFeatures(others);

        // points
        setX.setPointFeatureIndex(
          new KDBush(
            points,
            (p) => p.geometry.coordinates[0],
            (p) => p.geometry.coordinates[1]
          )
        );
        // other geometries
        const polyindex = createFlatbushIndex(others);
        setX.setPolyFeatureIndex(polyindex);
        set("initializingFeatures")(false);
        convertItemToFeatureProgressCallback({
          current: 100,
          total: 100,
          inProgress: false,
        });
      }
    })();
    //async end
  }, [state.filteredItems]);

  // effect on filter change
  useEffect(() => {
    if (state.items) {
      let filteredItems;
      if (state.filterFunction !== undefined) {
        filteredItems = state.filterFunction();
      } else if (state.itemFilterFunction !== undefined) {
        filteredItems = state.items.filter(
          state.itemFilterFunction({
            filterState: state.filterState,
            filterMode: state.filterMode,
            appMode: appMode,
            itemsDictionary: state.itemsDictionary,
          })
        );
      } else {
        filteredItems = state.items;
      }
      setX.setFilteredItems(filteredItems);
    }
  }, [
    state.filterState,
    state.filterMode,
    state.filterFunction,
    state.items,
    appMode,
  ]);

  //effect when boundingBox or selection changed
  useEffect(() => {
    if (state.initializingFeatures === true) {
      setX.setShownFeatures(undefined);
    } else {
      let pointFeaturesHits = [];
      let otherFeaturesHits = [];
      let featureHits;
      let projectedBoundingBox;
      if (boundingBox !== undefined && alwaysShowAllFeatures === false) {
        //reproject bounding box if map CRS is not FeatureCollection CRS
        if (state.epsgCode && mapEPSGCode && mapEPSGCode !== state.epsgCode) {
          const projectedNE = proj4(
            projectionData[mapEPSGCode].def,
            projectionData[state.epsgCode].def,
            [boundingBox.left, boundingBox.bottom]
          );

          const projectedSW = proj4(
            projectionData[mapEPSGCode].def,
            projectionData[state.epsgCode].def,
            [boundingBox.right, boundingBox.top]
          );
          projectedBoundingBox = {};
          projectedBoundingBox.left = projectedNE[0];
          projectedBoundingBox.bottom = projectedNE[1];
          projectedBoundingBox.right = projectedSW[0];
          projectedBoundingBox.top = projectedSW[1];
        } else {
          projectedBoundingBox = boundingBox;
        }

        if (pointFeatureIndex !== undefined) {
          let resultIds = pointFeatureIndex.range(
            projectedBoundingBox.left,
            projectedBoundingBox.bottom,
            projectedBoundingBox.right,
            projectedBoundingBox.top
          );
          for (const id of resultIds) {
            const f = allFeatures[id];
            pointFeaturesHits.push(allFeatures[id]);
          }

          pointFeaturesHits.sort((a, b) => {
            if (a.geometry.coordinates[1] === b.geometry.coordinates[1]) {
              return a.geometry.coordinates[0] - b.geometry.coordinates[0];
            } else {
              return b.geometry.coordinates[1] - a.geometry.coordinates[1];
            }
          });
        }
        let unsortedOtherFeaturesHits = [];
        if (polyFeatureIndex !== undefined) {
          unsortedOtherFeaturesHits = findInFlatbush(
            polyFeatureIndex,
            bboxPolygon([
              projectedBoundingBox.left,
              projectedBoundingBox.bottom,
              projectedBoundingBox.right,
              projectedBoundingBox.top,
            ]),
            otherFeatures
          );

          const ofhCenterObjects = unsortedOtherFeaturesHits.map((f) => {
            return {
              feature: f,
              center: center(f.geometry),
            };
          });

          ofhCenterObjects.sort((a, b) => {
            const ax = a.center.geometry.coordinates[0];
            const ay = a.center.geometry.coordinates[1];
            const bx = b.center.geometry.coordinates[0];
            const by = b.center.geometry.coordinates[1];
            if (ay === by) {
              return ax - bx;
            } else {
              return by - ay; //reverse order means from north to south
            }
          });

          otherFeaturesHits = ofhCenterObjects.map((ofh) => {
            return ofh.feature;
          });
        }

        featureHits = [...pointFeaturesHits, ...otherFeaturesHits];
      } else {
        featureHits = allFeatures;
      }
      let _shownFeatures = [];
      let i = 0;

      //sort features here to get a user controlled order in the map

      for (const f of featureHits || []) {
        const nf = {
          selected: false,
          index: i++,
          ...f,
        };
        _shownFeatures.push(nf);
      }

      if (selectedIndexState.forced === false) {
        if (selectedFeature === undefined && selectedIndex !== 0) {
          const selIndex = getFirstSelectableFeatureIndex();
          if (selIndex !== -1) {
            setSelectedIndex(selIndex);
          }
        } else if (selectedFeature !== undefined) {
          const found = _shownFeatures.find(
            (testfeature) => selectedFeature.id === testfeature.id
          );

          if (found !== undefined) {
            if (found.index !== selectedIndex) {
              setSelectedIndex(found.index);
              return;
            }
          } else {
            const selIndex = getFirstSelectableFeatureIndex();

            if (selIndex !== -1) {
              if (selIndex !== selectedIndex) {
                setSelectedIndex(selIndex);
                return;
              }
            }
          }
        }
      }
      let sf;
      try {
        sf = _shownFeatures[selectedIndex];
        if (sf) {
          if (sf.preventSelection !== true) {
            sf.selected = true;
          } else {
            console.log("prevent selection in sf (this should not happen)", sf);
          }
        }
      } catch (e) {
        console.log("Error in sf creation", e);
      }

      set("selectedFeature")(sf);

      // setX.setSelectedFeature(sf);
      if (deriveSecondarySelection && sf) {
        set("secondarySelection")(
          deriveSecondarySelection({
            selectedFeature: sf,
            appMode: appMode,
            itemsDictionary: state.itemsDictionary,
            featureCollection: state.shownFeatures,
            secondarySelection: state.secondarySelection,
          })
        );
      }
      if (selectedIndexState.forced === true) {
        setSelectedIndex(selectedIndex); //set forced=false
      }
      setX.setShownFeatures(_shownFeatures);
    }
  }, [
    state.epsgCode,
    boundingBox,
    pointFeatureIndex,
    polyFeatureIndex,
    allFeatures,
    selectedIndexState,
    state.initializingFeatures,
    state,
  ]);

  // useEffect(() => {
  //   console.log("ℹ️ selectedIndexState", selectedIndexState);
  // }, [selectedIndexState]);

  const load = (url) => {
    getItems({
      itemsUrl: url,
      ...setX,
      name: featureCollectionName,
      convertItemToFeature,
    });
  };

  // effect on start
  useEffect(() => {
    if (itemsURL) {
      load(itemsURL);
    }
  }, []);

  if (enabled === true) {
    return (
      <StateContext.Provider value={state}>
        <DispatchContext.Provider
          value={{
            dispatch,
            ...setX,
            load,
            setSelectedFeatureIndex,
            setSelectedFeatureByPredicate,

            next: () => {
              if (nextFeature) {
                nextFeature();
              } else {
                next();
              }
            },
            prev: () => {
              if (prevFeature) {
                prevFeature();
              } else {
                prev();
              }
            },
            fitBoundsForCollection,
          }}
        >
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  } else {
    return (
      <StateContext.Provider value={undefined}>
        <DispatchContext.Provider
          value={{
            undefined,
          }}
        >
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  }
};

export default FeatureCollectionContextProvider;

export {
  FeatureCollectionContextProvider,
  StateContext as FeatureCollectionContext,
  DispatchContext as FeatureCollectionDispatchContext,
};
