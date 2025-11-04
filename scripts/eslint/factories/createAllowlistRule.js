const { minimatch } = require("minimatch");

/**
 * Factory to create ESLint rules that only allow specific package imports.
 * This is a true allowlist - blocks everything except what's specified.
 *
 * @param {Object} config - Rule configuration
 * @param {string[]} config.allowedPackages - List of allowed package patterns (e.g., ['cesium', '@carma/geo/*'])
 * @param {string} config.message - Error message to display
 * @param {boolean} [config.allowTypeImports=true] - Allow type-only imports from any package
 * @param {boolean} [config.allowRelativeImports=true] - Allow relative imports (./foo, ../bar)
 * @returns {Object} ESLint rule definition
 */
module.exports = function createAllowlistRule(config) {
  const {
    allowedPackages,
    message,
    allowTypeImports = true,
    allowRelativeImports = true,
  } = config;

  return {
    meta: {
      type: "problem",
      docs: {
        description: "Only allow specific package imports",
        recommended: false,
      },
      messages: {
        notAllowed: message || "This import is not allowed.",
      },
      schema: [],
    },

    create(context) {
      /**
       * Check if an import path is allowed
       * @param {string} importPath - The import path to check
       * @returns {boolean} True if allowed
       */
      function isAllowed(importPath) {
        // Allow relative imports if configured
        if (allowRelativeImports && importPath.startsWith(".")) {
          return true;
        }

        // Check against allowlist patterns
        return allowedPackages.some((pattern) => {
          // Exact match
          if (importPath === pattern) {
            return true;
          }

          // Pattern with wildcard (e.g., '@carma/geo/*')
          if (pattern.endsWith("/*")) {
            const prefix = pattern.slice(0, -2);
            return importPath === prefix || importPath.startsWith(`${prefix}/`);
          }

          // Pattern matches subpaths (e.g., 'cesium' matches 'cesium/Source/...')
          return importPath.startsWith(`${pattern}/`);
        });
      }

      return {
        ImportDeclaration(node) {
          const importPath = node.source.value;

          // Allow type-only imports if configured
          if (allowTypeImports && node.importKind === "type") {
            return;
          }

          // Check for type-only specifiers
          if (
            allowTypeImports &&
            node.specifiers.every((spec) => spec.importKind === "type")
          ) {
            return;
          }

          if (!isAllowed(importPath)) {
            context.report({
              node: node.source,
              messageId: "notAllowed",
            });
          }
        },

        // Also check dynamic imports
        ImportExpression(node) {
          if (node.source.type !== "Literal") {
            return;
          }

          const importPath = node.source.value;

          if (!isAllowed(importPath)) {
            context.report({
              node: node.source,
              messageId: "notAllowed",
            });
          }
        },
      };
    },
  };
};
