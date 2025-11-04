/**
 * CARMA ESLint Plugin - Custom rules and configuration helpers for the monorepo
 */

const createRestrictedImportRule = require("./factories/createRestrictedImportRule");
const createAllowlistRule = require("./factories/createAllowlistRule");

// ============================================================================
// Custom ESLint Rules
// ============================================================================

const rules = {
  "no-direct-proj4": createRestrictedImportRule({
    packageName: "proj4",
    allowedPaths: ["**/libraries/commons/geo/proj/**"],
    wrapperPackage: "@carma/geo/proj",
    message:
      "Import proj4 only through @carma/geo/proj. Use getProj4Converter() or convenience functions like getFromUTM32ToWGS84().",
    allowTypeImports: true,
  }),

  "no-direct-cesium": createRestrictedImportRule({
    packageName: "cesium",
    allowedPaths: ["**/libraries/mapping/engines/cesium/api/**"],
    wrapperPackages: ["@carma/cesium"],
    message:
      "Import cesium only through @carma/cesium. Use the curated API surface for better manageability.",
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
};

// ============================================================================
// Configuration Helper Functions
// ============================================================================

/**
 * Create a config block that blocks Redux imports in specified paths
 * @param {Object} baseConfig - The base ESLint configuration
 * @param {string[]} files - Glob patterns for files to apply the rule to
 * @param {string[]} [ignores] - Glob patterns to exclude
 * @returns {Object} ESLint config object
 */
function noReduxConfig(baseConfig, files, ignores = []) {
  return {
    ...baseConfig,
    name: "Libraries (no Redux)",
    files,
    ignores,
    rules: {
      ...baseConfig.rules,
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["react-redux"],
              message:
                "react-redux should only be used in apps, not in libraries. Libraries should accept dependencies via props/callbacks.",
            },
          ],
        },
      ],
    },
  };
}

/**
 * Create a config block that blocks React imports in framework-agnostic paths
 * @param {Object} baseConfig - The base ESLint configuration
 * @param {string[]} files - Glob patterns for files to apply the rule to
 * @returns {Object} ESLint config object
 */
function noReactConfig(baseConfig, files) {
  return {
    ...baseConfig,
    name: "Framework-Agnostic (no React)",
    files,
    rules: {
      ...baseConfig.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "React imports are not allowed in this path. This code must remain framework-agnostic.",
            },
          ],
        },
      ],
    },
  };
}

/**
 * Generic allowlist config - only allows specified packages in specified paths
 * @param {Object} baseConfig - The base ESLint configuration
 * @param {Object} options - Configuration options
 * @param {string} options.name - Name for the config block
 * @param {string[]} options.files - Glob patterns for files to apply the rule to
 * @param {string[]} [options.ignores] - Glob patterns to exclude
 * @param {string[]} options.allowedPackages - List of allowed packages (e.g., ['cesium', '@carma/units/*'])
 * @param {string} [options.message] - Error message for blocked imports
 * @param {boolean} [options.allowTypeImports=true] - Allow type-only imports
 * @param {boolean} [options.allowRelativeImports=true] - Allow relative imports
 * @returns {Object} ESLint config object
 */
function allowlistConfig(baseConfig, options) {
  const {
    name,
    files,
    ignores = [],
    allowedPackages,
    message = `Only allowed packages: ${allowedPackages.join(", ")}`,
    allowTypeImports = true,
    allowRelativeImports = true,
  } = options;

  // Create a unique rule name for this allowlist
  const ruleName = `allowlist-${name.toLowerCase().replace(/\s+/g, "-")}`;

  // Add the new rule to the existing carma plugin (don't redefine the plugin)
  if (baseConfig.plugins?.carma?.rules) {
    baseConfig.plugins.carma.rules[ruleName] = createAllowlistRule({
      allowedPackages,
      message,
      allowTypeImports,
      allowRelativeImports,
    });
  }

  return {
    ...baseConfig,
    name,
    files,
    ignores,
    rules: {
      ...baseConfig.rules,
      [`carma/${ruleName}`]: "error",
    },
  };
}

// ============================================================================
// Plugin Export
// ============================================================================

module.exports = {
  rules,
  noReduxConfig,
  noReactConfig,
  allowlistConfig,
};
