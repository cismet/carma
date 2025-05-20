const cfg = (window as any).VERDIS_ONLINE_ENV_CONFIG ?? {};

export const DOMAIN = cfg.DOMAIN ?? "VERDIS_GRUNDIS";
export const GEOM_CLASS = cfg.GEOM_CLASS ?? "GEOM";
export const GEOM_FIELD = cfg.GEOM_FIELD ?? "geo_field";

//export const SERVICE = "http://192.168.178.69:8890";
//export const STAC_SERVICE = "http://192.168.178.69:8890";

// export const SERVICE = "http://s10221:27065";
// export const STAC_SERVICE = "http://s10221:27065";

// export const SERVICE = "http://leo/api/rest/v1/verdis";
// export const STAC_SERVICE = "http://leo/api/rest/v1/verdis";

// export const SERVICE = 'https://verdis-api.cismet.de';
// export const STAC_SERVICE = 'https://verdis-api.cismet.de';

// export const SERVICE = 'http://cids-blau.s10222.wuppertal-intra.de/grundis/api/';
// export const STAC_SERVICE = 'http://cids-blau.s10222.wuppertal-intra.de/grundis/api/';

// test db
// export const SERVICE = 'http://s10222.wuppertal-intra.de:8890';
// export const STAC_SERVICE = 'http://s10222.wuppertal-intra.de:8890';

// live db
// export const SERVICE = "https://verdis-api.cismet.de";
// export const STAC_SERVICE = "https://verdis-api.cismet.de";
// export const SERVICE = 'http://localhost:8890';
// export const STAC_SERVICE = 'http://localhost:8890';

// Playground DB
export const SERVICE =
  cfg.SERVICE ?? "https://verdis-cloud.cismet.de/verdis/api/";
export const STAC_SERVICE =
  cfg.STAC_SERVICE ?? "https://verdis-cloud.cismet.de/verdis/api/";

export const PLAYGROUND = cfg.PLAYGROUND ?? true;
