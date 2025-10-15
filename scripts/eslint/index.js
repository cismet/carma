const createRestrictedImportRule = require("./rules/createRestrictedImportRule");

/* custom eslint rules for carma monorepo, keep in sync with eslint.config.cjs and tsconfig path aliases */

module.exports = {
  rules: {
    "no-direct-proj4": createRestrictedImportRule({
      packageName: "proj4",
      allowedPaths: ["**/libraries/geo/proj/**"],
      wrapperPackage: "@carma/geo/proj",
      message:
        "Import proj4 only through @carma/geo/proj. Use getProj4Converter() or convenience functions like getFromUTM32ToWGS84().",
      allowTypeImports: true,
    }),

    "no-direct-cesium": createRestrictedImportRule({
      packageName: "cesium",
      allowedPaths: [
        "**/libraries/mapping/engines/cesium/**",
        "**/libraries/mapping/engines/cesium-widget/**",
      ],
      wrapperPackages: [
        "@carma-mapping/engines/cesium",
        "@carma-mapping/engines/cesium-widget",
      ],
      message: "Import cesium only in @carma-mapping/engines/cesium",
      allowTypeImports: true,
    }),

    "no-direct-leaflet": createRestrictedImportRule({
      packageName: "leaflet",
      allowedPaths: ["**/libraries/mapping/engines/leaflet/**"],
      wrapperPackage: "@carma-mapping/engines/leaflet",
      message:
        "Consider using leaflet through @carma-mapping/engines/leaflet wrapper for better integration.",
      allowTypeImports: true,
    }),

    "no-direct-maplibre": createRestrictedImportRule({
      packageName: "maplibre-gl",
      allowedPaths: ["**/libraries/mapping/engines/maplibre/**"],
      wrapperPackage: "@carma-mapping/engines/maplibre",
      message:
        "Consider using maplibre-gl through @carma-mapping/engines/maplibre wrapper for better integration.",
      allowTypeImports: true,
    }),
  },
};
