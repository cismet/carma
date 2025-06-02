export const PLAYGROUND_INDICATOR = [/verdis-api.cismet.de/];

export const DOMAIN = import.meta.env.VITE_CIDS_DOMAIN ?? "VERDIS_GRUNDIS";
export const GEOM_CLASS = import.meta.env.VITE_CIDS_VERDIS_GEOM_CLASS ?? "GEOM";
export const GEOM_FIELD =
  import.meta.env.VITE_CIDS_VERDIS_GEOM_FIELD ?? "geo_field";

export const SERVICE =
  import.meta.env.VITE_CIDS_SERVICE ||
  "https://verdis-cloud.cismet.de/verdis/api/";
export const STAC_SERVICE =
  import.meta.env.VITE_STAC_SERVICE ||
  SERVICE ||
  "https://verdis-cloud.cismet.de/verdis/api/";

export const PLAYGROUND = !PLAYGROUND_INDICATOR.some((regex) =>
  regex.test(SERVICE)
);
