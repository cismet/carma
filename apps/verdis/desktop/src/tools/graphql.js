import { DOMAIN, REST_SERVICE } from "../constants/verdis";
import { getNonce } from "./helper";

export async function fetchGraphQL(
  query,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = ""
) {
  //check if there is a query param with the name logGQL

  const logGQLFromSearch = new URLSearchParams(window.location.search).get(
    "logGQL"
  );
  const logGQLEnabled =
    logGQLFromSearch !== null && logGQLFromSearch !== "false";
  const nonce = getNonce();

  let myHeaders = new Headers();

  myHeaders.append("Authorization", "Bearer " + (jwt || "unset.jwt.token"));
  myHeaders.append("Content-Type", "application/json");

  const queryObject = {
    query,
    variables: variables,
  };
  const body = JSON.stringify(queryObject);
  if (logGQLEnabled && forceSkipLogging === false) {
    console.log(`logGQL:: GraphQL query (${nonce}):`, queryObject);
  }
  try {
    const response = await fetch(
      REST_SERVICE + `/${apiPrefix}graphql/` + DOMAIN + "/execute",
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
