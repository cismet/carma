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
        "**/libraries/mapping/engines/cesium/api/**",
        "**/libraries/mapping/engines/cesium/types/**",
      ],
      wrapperPackages: ["@carma/cesium"],
      message:
        "Import cesium only through @carma/cesium. Use the curated API surface for better manageability.",
      allowTypeImports: false,
    }),
    "no-cesium-api-in-types": createRestrictedImportRule({
      packageName: "@carma/cesium",
      includePaths: ["**/libraries/mapping/engines/cesium/types/**"],
      message:
        "cesium/types must never import from @carma/cesium (cesium/api). Import directly from 'cesium' instead to avoid circular dependencies.",
      allowTypeImports: false,
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
