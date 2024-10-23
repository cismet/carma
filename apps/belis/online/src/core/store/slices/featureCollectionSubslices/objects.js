import bboxPolygon from '@turf/bbox-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import { fetchGraphQL } from '../../../commons/graphql';
import {
  cloneFeature,
  compareFeature,
  getDocs,
  integrateIntermediateResults,
} from '../../../helper/featureHelper';
import {
  convertBoundingBox,
  createQueryGeomFromBB,
} from '../../../helper/gisHelper';
import onlineQueryParts, { geomFactories } from '../../../queries/online';
import { CONNECTIONMODE, getConnectionMode } from '../app';
import {
  getFeatureCollection,
  getFilter,
  getSelectedFeature,
  MODES,
  setDoneForMode,
  setFeatureCollectionForMode,
  setFeatureCollectionInfoForMode,
  setRequestBasis,
  setSelectedFeature,
} from '../featureCollection';
import { HEALTHSTATUS, setHealthState } from '../health';
import { workerInstance } from '../../../workers/utils';

const dexieW = workerInstance;

export const loadObjectsIntoFeatureCollection = ({
  boundingBox,
  _inFocusMode,
  _zoom,
  _overridingFilterState,
  jwt,
  onlineDataForcing = false,
}) => {
  if (boundingBox) {
    //const boundingBox=
    return async (dispatch, getState) => {
      dispatch(setDoneForMode({ mode: MODES.OBJECTS, done: false }));
      const state = getState();
      const connectionMode = getConnectionMode(state);
      const filter = getFilter(state);
      // const selectedFeature=
      const convertedBoundingBox = convertBoundingBox(boundingBox);

      if (
        onlineDataForcing ||
        state.spatialIndex.loading === 'done' ||
        connectionMode === CONNECTIONMODE.ONLINE
      ) {
        let resultIds, leitungsFeatures;
        if (connectionMode === CONNECTIONMODE.FROMCACHE) {
          resultIds = state.spatialIndex.pointIndex.range(
            convertedBoundingBox.left,
            convertedBoundingBox.bottom,
            convertedBoundingBox.right,
            convertedBoundingBox.top
          );

          //console.log('xxx alle resultIds da ', new Date().getTime() - d);

          leitungsFeatures = [];

          if (filter.leitung.enabled === true) {
            leitungsFeatures = state.spatialIndex.lineIndex
              .search(
                convertedBoundingBox.left,
                convertedBoundingBox.bottom,
                convertedBoundingBox.right,
                convertedBoundingBox.top
              )
              .map((i) => state.spatialIndex.lineIndex.features[i]);

            //double check if the feature is in the bounding box
            //till now we only have a rough intersction of the lines bbox
            //this will now do a real intersection and filter out the lines that are not in the bbox
            const bbox25832 = convertBoundingBox(boundingBox);
            const bboxGeom = bboxPolygon([
              bbox25832.left,
              bbox25832.top,
              bbox25832.right,
              bbox25832.bottom,
            ]).geometry;

            //this filter doenst work in safari
            //leitungsFeatures = leitungsFeatures.filter((f) => booleanIntersects(f, bboxGeom));

            //...therefore we do it the old fashioned way

            const intersectingLeitungsFeatures = [];
            for (const f of leitungsFeatures) {
              if (booleanIntersects(f, bboxGeom)) {
                intersectingLeitungsFeatures.push(f);
              }
            }
            leitungsFeatures = intersectingLeitungsFeatures;
          }
        } else {
        }
        // console.log('leitungsFeatures', leitungsFeatures);

        if (
          connectionMode === CONNECTIONMODE.FROMCACHE &&
          onlineDataForcing === false
        ) {
          dexieW
            .getFeaturesForHits(
              state.spatialIndex.pointIndex.points,
              resultIds,
              filter
            )
            .then((pointFeatureCollection) => {
              //console.log('xxx alle Features da ', new Date().getTime() - d);
              const featureCollection = leitungsFeatures.concat(
                pointFeatureCollection
              );
              enrichAndSetFeatures(dispatch, state, featureCollection, false);
              //console.log('xxx vor setFeatureCollection');
              //console.log("updated featureCollection ", featureCollection);

              // dispatch(setFeatureCollection(featureCollection));
              //setFC(featureCollection);
              //console.log('xxx nach  setFeatureCollection', new Date().getTime() - d);

              //console.log('xxx', '(done = true)');
              // dispatch(setDone(true));
            });
        } else {
          let queryparts = '';

          for (const filterKey of Object.keys(filter)) {
            if (filter[filterKey].enabled === true) {
              const qp = onlineQueryParts[filterKey];
              queryparts += qp + '\n';
            }
          }
          const gqlQuery = `query q($bbPoly: geometry!) {${queryparts}}`;

          const queryParameter = {
            bbPoly: createQueryGeomFromBB(convertedBoundingBox),
          };
          try {
            console.time('query returned');
            // online query
            const response = await fetchGraphQL(gqlQuery, queryParameter, jwt);
            console.timeEnd('query returned');

            if (response?.ok) {
              const featureCollection = [];
              for (const key of Object.keys(response.data || {})) {
                const objects = response.data[key];
                for (const o of objects) {
                  const feature = createFeatureFromData(o, key);
                  featureCollection.push(feature);
                }
              }
              enrichAndSetFeatures(dispatch, state, featureCollection, true);
            } else {
              throw new Error(
                'Error in fetchGraphQL (' + response.status + ')'
              );
            }
          } catch (e) {
            console.log('error was thrown', e);
            console.log('errorneous query', { gqlQuery, queryParameter, jwt });
            dispatch(setRequestBasis(undefined));
            dispatch(setHealthState({ jwt, healthState: HEALTHSTATUS.ERROR }));
          }
        }
      }
      // else {
      //   console.log("xxx loadObjects with index not done");

      //   dispatch(
      //     initIndex(() => {
      //       dispatch(
      //         loadObjectsIntoFeatureCollection({ boundingBox: convertedBoundingBox, jwt: jwt })
      //       );
      //     })
      //   );
      // }
    };
  }
};

export const createFeatureFromData = (data, type) => {
  const feature = {
    text: '-',
    id: type,
    enriched: true,
    type: 'Feature',
    selected: false,
    featuretype: type,
    // geometry: geomfactory(data),
    geometry: geomFactories[type](data),
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:EPSG::25832',
      },
    },
    properties: {},
  };

  //The geometry could be deleted to save some memory
  //need to be a different approach in the geometryfactory then
  //not sure beacuse the properties would double up the memoryconsumption though
  //
  // const properties=JSON.parse(JSON.stringify(o));
  // delete propertiesgeomFactories[key](o)

  feature.properties = data;

  feature.id = feature.id + '-' + data.id;
  feature.properties.docs = getDocs(feature);
  return feature;
};

const enrichAndSetFeatures = (
  dispatch,
  state,
  featureCollectionIn
  // removeFromIntermediateResults
) => {
  console.time('features enirched');

  const tasks = [];

  const currentFeatureCollection = getFeatureCollection(state);

  const stillInMap = currentFeatureCollection.filter((f) =>
    featureCollectionIn.find((test) => f.id === test.id)
  );
  const newInMap = featureCollectionIn.filter(
    (f) => stillInMap.find((test) => f.id === test.id) === undefined
  );
  // console.log("stillInMap", stillInMap);
  // console.log("newInMap", newInMap);
  // console.log("oldInMap", featureCollectionIn);
  const featureCollection = [...stillInMap, ...newInMap];
  //const featureCollection = featureCollectionIn;

  // prerendering featureCollection
  // needs to change listitems defauklt attributes to "... wird geladen"
  //dispatch(setFeatureCollection(featureCollection));

  for (const f of featureCollection) {
    tasks.push(cloneFeature(f));
  }
  const selectedFeature = getSelectedFeature(state);
  // let intermediateResultsToBeRemoved = [];

  Promise.all(tasks).then(
    (enrichedFeatureCollection) => {
      console.timeEnd('features enirched');
      const sortedElements = [];
      const typeCount = {};
      let selectionStillInMap = false;
      // console.time("cycling through enriched fc");

      for (const feature of enrichedFeatureCollection) {
        feature.intermediateResultsIntegrated = new Date().getTime();
        integrateIntermediateResults(
          feature,
          state.offlineActionDb.intermediateResults
        );

        if (typeCount[feature.featuretype] === undefined) {
          typeCount[feature.featuretype] = 1;
        } else {
          typeCount[feature.featuretype] = typeCount[feature.featuretype] + 1;
        }

        if (feature.properties.is_deleted !== true) {
          sortedElements.push(feature);
          // console.log("shown feature", feature);
        } else {
          // console.log("deleted feature", feature);
        }
        // sortedElements.push(feature);

        if (selectedFeature && feature.id === selectedFeature.id) {
          selectionStillInMap = true;
          // feature.selected = true;
        }
      }
      // console.timeEnd("cycling through enriched fc");

      sortedElements.sort(compareFeature);
      if (!selectionStillInMap) {
        dispatch(setSelectedFeature(null));
      }
      let index = 0;
      for (const f of sortedElements) {
        f.index = index++;
      }

      dispatch(
        setFeatureCollectionInfoForMode({
          mode: MODES.OBJECTS,
          info: { typeCount },
        })
      );

      dispatch(
        setFeatureCollectionForMode({
          features: sortedElements,
          mode: MODES.OBJECTS,
        })
      );

      dispatch(setDoneForMode({ mode: MODES.OBJECTS, done: true }));
    },
    (error) => {
      alert('problem' + error);
      //todo: do something
    }
  );
};
