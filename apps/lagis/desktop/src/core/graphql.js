import { REST_SERVICES } from "../constants/lagis";
import { getNonce } from "./tools/helper";

export async function fetchGraphQLFromWuNDa(
  query,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = ""
) {
  return await fetchGraphQLFromService(
    query,
    variables,
    jwt,
    forceSkipLogging,
    apiPrefix,
    "WUNDA_BLAU"
  );
}

export async function fetchGraphQLFromLagIS(
  query,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = ""
) {
  return await fetchGraphQLFromService(
    query,
    variables,
    jwt,
    forceSkipLogging,
    apiPrefix,
    "LAGIS"
  );
}

export async function fetchGraphQLFromService(
  query,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = "",
  domain
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
      REST_SERVICES[domain] + `/${apiPrefix}graphql/` + domain + "/execute",
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

//backwards compatibility: do lagis query
export async function fetchGraphQL(
  query,
  variables,
  jwt,
  forceSkipLogging = false,
  apiPrefix = ""
) {
  return await fetchGraphQLFromLagIS(
    query,
    variables,
    jwt,
    forceSkipLogging,
    apiPrefix,
    "LAGIS"
  );
}
