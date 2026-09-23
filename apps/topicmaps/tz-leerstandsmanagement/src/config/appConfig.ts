/**
 * Application configuration for TZ Leerstandsmanagement.
 *
 * Defaults point at the "rot" test instance of the WuNDa cloud server
 * (see wupp #4138). Environment variables can override every value.
 */
export const APP_CONFIG = {
  appKey: "tz.leerstandsmanagement",

  // cids REST service (with trailing slash)
  restService:
    import.meta.env.VITE_TZ_LEERSTANDSMANAGEMENT_REST_SERVICE ||
    "https://wunda-rot-cloud.cismet.de/wunda/api/",

  domain: import.meta.env.VITE_TZ_LEERSTANDSMANAGEMENT_DOMAIN || "WUNDA_BLAU",

  /** GraphQL endpoint of the cids proxy, derived from restService + domain */
  get endpoint() {
    const base = this.restService.endsWith("/")
      ? this.restService
      : this.restService + "/";
    return `${base}graphql/${this.domain}/execute`;
  },

  /** config attribute that holds the WebDAV target for photos */
  filesConfigAttribute: "geoportal.files",
  /** subfolder on the WebDAV host that receives Leerstand photos */
  photoFolder: "leerstand",

  /** side length in metres of the square used to look up nearby addresses */
  addressSearchWindowMeters: 60,

  jwtStorageKey: "@tz.leerstandsmanagement.auth.jwt",
  userStorageKey: "@tz.leerstandsmanagement.auth.user",
};
