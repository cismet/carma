// @ts-nocheck

import bboxPolygon from "@turf/bbox-polygon";
import { MappingConstants } from "react-cismap";
import bboxPolygon from "@turf/bbox-polygon";
import proj4 from "proj4";
import { MappingConstants } from "react-cismap";
import { proj4crs3857def } from "react-cismap/constants/gis";
import onlineQueryParts, { geomFactories } from "../queries/online";
import { FilterState } from "../..";

export const featuresFilter: FilterState = {
  tdta_leuchten: { title: "Leuchten", enabled: true },
  tdta_standort_mast: { title: "Masten (ohne Leuchten)", enabled: true },
  mauerlasche: { title: "Mauerlaschen", enabled: true },
  leitung: { title: "Leitungen", enabled: true },
  schaltstelle: { title: "Schaltstellen", enabled: true },
  abzweigdose: { title: "Abzweigdosen", enabled: true },
};

export const createQueryGeomFromBB = (boundingBox) => {
  const geom = bboxPolygon([
    boundingBox.left,
    boundingBox.top,
    boundingBox.right,
    boundingBox.bottom,
  ]).geometry;
  geom.crs = {
    type: "name",
    properties: {
      name: "urn:ogc:def:crs:EPSG::25832",
    },
  };
  return geom;
};

export const getNonce = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const todayString = yyyy + mm + dd;
  const todayInt = parseInt(todayString);
  return todayInt + Math.random();
};

export async function fetchGraphQL(
  operationsDoc,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = "",
  REST_SERVICE,
  DOMAIN
) {
  //check if there is a query param with the name logGQL
  const logGQLFromSearch = new URLSearchParams(window.location.search).get(
    "logGQL"
  );
  const logGQLEnabled =
    logGQLFromSearch !== null && logGQLFromSearch !== "false";
  const nonce = getNonce();

  //	const result = await fetch('http:// localhost:8890/actions/WUNDA_BLAU.graphQl/tasks?resultingInstanceType=result', {
  let myHeaders = new Headers();

  myHeaders.append("Authorization", "Bearer " + (jwt || "unset.jwt.token"));
  myHeaders.append("Content-Type", "application/json");

  const queryObject = {
    query: operationsDoc,
    variables: variables,
  };

  if (apiPrefix === "z2") {
    queryObject.chunked = true;
  }
  const body = JSON.stringify(queryObject);
  if (logGQLEnabled && forceSkipLogging === false) {
    console.log(`logGQL:: GraphQL query (${nonce}):`, queryObject);
  }
  try {
    const response = await fetch(
      REST_SERVICE + `/graphql/` + DOMAIN + "/execute",
      {
        method: "POST",
        headers: myHeaders,
        body,
      }
    );
    if (response.status >= 200 && response.status < 300) {
      const resultjson = await response.json();

      if (logGQLEnabled && forceSkipLogging === false) {
        console.log(`logGQL:: Result (${nonce}):`, resultjson);
      }
      // return { ok: true, status: response.status, data: { tdta_leuchten: [] } };
      //check if resultsjson is an array or an object
      if (Array.isArray(resultjson)) {
        return { ok: true, status: response.status, data: resultjson };
      } else {
        return { ok: true, status: response.status, ...resultjson };
      }
    } else {
      return {
        ok: false,
        status: response.status,
      };
    }
  } catch (e) {
    if (logGQLEnabled && forceSkipLogging === false) {
      console.log("error in fetch", e);
    }
    throw new Error(e);
  }
}

export const createFeatureFromData = (data, type) => {
  const feature = {
    text: "-",
    id: type,
    enriched: true,
    type: "Feature",
    selected: false,
    featuretype: type,
    // geometry: geomfactory(data),
    geometry: geomFactories[type](data),
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
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

  feature.id = feature.id + "-" + data.id;
  feature.properties.docs = getDocs(feature);
  return feature;
};

const integrateIntermediateResultsIntoObjects = (
  intermediateResults,
  item,
  type,
  id
) => {
  // console.log("integrateIntermediateResultsIntoObjects " + type, id);

  if (intermediateResults && intermediateResults[type]) {
    const irs = intermediateResults[type][id];
    if (irs?.object) {
      for (const ir of irs.object) {
        for (const key of Object.keys(ir)) {
          // console.log("iv in ", { item, key });

          item[key] = ir[key];
          //will ad a property with _iv postfix to the item, so that the ui can recognize it
          item[key + "_iv"] = true;
        }
      }
    }
  }
};

const enrichAndSetFeatures = (
  dispatch,
  state,
  featureCollectionIn
  // removeFromIntermediateResults
) => {
  console.time("features enirched");

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
      console.timeEnd("features enirched");
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
        // dispatch(setSelectedFeature(null));
      }
      let index = 0;
      for (const f of sortedElements) {
        f.index = index++;
      }

      // dispatch(
      //   setFeatureCollectionInfoForMode({
      //     mode: MODES.OBJECTS,
      //     info: { typeCount },
      //   })
      // );

      // dispatch(
      //   setFeatureCollectionForMode({
      //     features: sortedElements,
      //     mode: MODES.OBJECTS,
      //   })
      // );

      // dispatch(setDoneForMode({ mode: MODES.OBJECTS, done: true }));
    },
    (error) => {
      alert("problem" + error);
      //todo: do something
    }
  );
};

export function convertBoundingBox(
  bbox,
  refDefIn = MappingConstants.proj4crs3857def,
  refDefOut = MappingConstants.proj4crs25832def
) {
  if (bbox) {
    const [left, top] = proj4(refDefIn, refDefOut, [bbox.left, bbox.top]);
    const [right, bottom] = proj4(refDefIn, refDefOut, [
      bbox.right,
      bbox.bottom,
    ]);
    return { left, top, right, bottom };
  }
}

const addDmsUrl = (docs, dmsUrl, caption) => {
  if (dmsUrl?.url?.object_name) {
    try {
      docs.push({
        caption: caption,
        doc: dmsUrl.url.object_name,
        description: dmsUrl?.description,
      });
    } catch (e) {
      console.log("error" + e, dmsUrl);
    }
  }
};

const addDokumenteArrayOfDmsUrls = (docs, dArray, caption) => {
  for (const doc of dArray || []) {
    addDmsUrl(docs, doc.dms_url, caption);
  }
};
export const getDocs = (feature) => {
  const docs = [];

  let type, item;
  if (feature.featuretype === "arbeitsprotokoll") {
    addDokumenteArrayOfDmsUrls(
      docs,
      feature?.properties?.veranlassung?.ar_dokumenteArray,
      "Veranlassung"
    );

    //add intermediate docs of veranlassung
    for (const doc of feature?.properties?.veranlassung?.docs || []) {
      docs.push(doc);
    }

    type = feature.fachobjekttype;
    item = feature.properties.fachobjekt;
  } else {
    type = feature.featuretype;
    item = feature.properties;
  }

  switch (type) {
    case "tdta_leuchten":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Leuchte");
      addDokumenteArrayOfDmsUrls(
        docs,
        item?.fk_standort?.dokumenteArray,
        "Standort"
      );
      addDmsUrl(docs, item?.fk_leuchttyp?.dms_url, "Leuchtentyp");
      addDokumenteArrayOfDmsUrls(
        docs,
        item?.fk_leuchttyp?.dokumenteArray,
        "Leuchtentyp"
      );
      addDmsUrl(docs, item?.fk_standort?.tkey_masttyp?.dms_url, "Masttyp");
      addDokumenteArrayOfDmsUrls(
        docs,
        item?.fk_standort?.tkey_masttyp?.dokumenteArray,
        "Masttyp"
      );
      return docs;
    case "Leitung":
    case "leitung":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Leitung");
      return docs;
    case "mauerlasche":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Mauerlasche");
      return docs;
    case "schaltstelle":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Schaltstelle");
      addDmsUrl(
        docs,
        item?.rundsteuerempfaenger?.dms_url,
        "Rundsteuerempfänger"
      );
      return docs;
    case "abzweigdose":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Abzweigdose");
      return docs;
    case "tdta_standort_mast":
      addDokumenteArrayOfDmsUrls(docs, item?.dokumenteArray, "Standort");
      addDmsUrl(docs, item?.tkey_masttyp?.dms_url, "Masttyp");
      addDokumenteArrayOfDmsUrls(
        docs,
        item?.tkey_masttyp?.dokumenteArray,
        "Masttyp"
      );
      return docs;
    case "arbeitsprotokoll":
      return docs;
    case "arbeitsauftrag":
      return docs;
    case "geom":
    case "geometrie":
      return docs;
    default:
      console.log("unknown featuretype. this should not happen", type);
      return docs;
  }
};

export const loadObjectsIntoFeatureCollection = (
  {
    boundingBox,
    _inFocusMode,
    _zoom,
    _overridingFilterState,
    jwt,
    onlineDataForcing = false,
  },
  REST_SERVICE,
  DOMAIN,
  setFeatureCollection,
  filter = featuresFilter,
  setDone
) => {
  if (boundingBox) {
    return async (dispatch, getState) => {
      dispatch(setDone(false));
      const convertedBoundingBox = convertBoundingBox(boundingBox);
      const state = getState();
      let queryparts = "";
      for (const filterKey of Object.keys(filter)) {
        if (filter[filterKey].enabled === true) {
          const qp = onlineQueryParts[filterKey];
          queryparts += qp + "\n";
        }
      }
      const gqlQuery = `query q($bbPoly: geometry!) {${queryparts}}`;

      const queryParameter = {
        bbPoly: createQueryGeomFromBB(convertedBoundingBox),
      };
      try {
        console.time("query returned");
        // online query
        const response = await fetchGraphQL(
          gqlQuery,
          queryParameter,
          jwt,
          false,
          "",
          REST_SERVICE,
          DOMAIN
        );
        console.timeEnd("query returned");

        if (response?.ok) {
          const featureCollection = [];
          for (const key of Object.keys(response.data || {})) {
            const objects = response.data[key];
            for (const o of objects) {
              const feature = createFeatureFromData(o, key);
              featureCollection.push(feature);
            }
          }

          dispatch(setFeatureCollection(featureCollection));
          // enrichAndSetFeatures(dispatch, state, featureCollection, true);
        } else {
          throw new Error("Error in fetchGraphQL (" + response.status + ")");
        }
      } catch (e) {
        console.log("error was thrown", e);
        console.log("errorneous query", { gqlQuery, queryParameter, jwt });
        // dispatch(setRequestBasis(undefined));
        // dispatch(setHealthState({ jwt, healthState: HEALTHSTATUS.ERROR }));
      } finally {
        dispatch(setDone(true));
      }
    };
  }
};
