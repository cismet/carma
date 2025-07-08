// @ts-nocheck

import bboxPolygon from "@turf/bbox-polygon";

export const filter = {
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
