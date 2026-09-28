import { fetchGraphQL } from "@carma-commons/utils";
import { APP_CONFIG } from "../../config/appConfig";

export class GraphQLRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GraphQLRequestError";
    this.status = status;
  }
}

/**
 * Runs a query or mutation against the cids GraphQL proxy and unwraps `data`.
 *
 * Proxy quirks worth knowing (verified against the rot instance):
 * - mutations must not use `returning`, only `affected_rows`
 * - `insert_*_one` and introspection are rejected
 * - inline object literals in mutations get mangled, so geometries and
 *   nested inserts MUST be passed through `variables`
 */
export async function gql<T>(
  jwt: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const result = await fetchGraphQL<T>(
    query,
    variables,
    jwt,
    APP_CONFIG.restService,
    APP_CONFIG.domain
  );
  if (!result.ok) {
    throw new GraphQLRequestError(
      result.errors?.[0]?.message ?? `HTTP ${result.status}`,
      result.status
    );
  }
  if (result.errors && result.errors.length > 0) {
    throw new GraphQLRequestError(result.errors[0].message, result.status);
  }
  return result.data as T;
}
