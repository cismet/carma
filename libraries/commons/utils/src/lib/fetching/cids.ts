/**
 * cids GraphQL fetch utility
 *
 * Fetches data from a cids REST service GraphQL endpoint.
 * Pattern from belis/online: /graphql/{DOMAIN}/execute
 */

export interface FetchGraphQLResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  errors?: Array<{ message: string; extensions?: unknown }>;
}

export async function fetchGraphQL<T = unknown>(
  operationsDoc: string,
  variables: Record<string, unknown>,
  jwt: string,
  restService: string,
  domain: string
): Promise<FetchGraphQLResult<T>> {
  const baseUrl = restService.endsWith("/")
    ? restService.slice(0, -1)
    : restService;

  const myHeaders = new Headers();
  myHeaders.append("Authorization", "Bearer " + (jwt || "unset.jwt.token"));
  myHeaders.append("Content-Type", "application/json");

  const queryObject = {
    query: operationsDoc,
    variables: variables,
  };

  const body = JSON.stringify(queryObject);

  try {
    const response = await fetch(baseUrl + `/graphql/` + domain + "/execute", {
      method: "POST",
      headers: myHeaders,
      body,
    });

    // Check for auth errors before parsing JSON (server may return HTML for 401)
    if (response.status === 401) {
      return { ok: false, status: 401 };
    }

    const resultjson = await response.json();

    if (response.status >= 200 && response.status < 300) {
      if (Array.isArray(resultjson)) {
        return { ok: true, status: response.status, data: resultjson as T };
      } else {
        return { ok: true, status: response.status, ...resultjson };
      }
    } else {
      return { ok: false, status: response.status, ...resultjson };
    }
  } catch (e) {
    console.error("fetchGraphQL error:", e);
    throw new Error(e as string);
  }
}
