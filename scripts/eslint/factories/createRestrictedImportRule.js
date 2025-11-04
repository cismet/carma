const { minimatch } = require("minimatch");
const path = require("path");
const fs = require("fs");

/**
 * Factory to create ESLint rules that restrict imports to specific paths.
 *
 * @param {Object} config - Rule configuration
 * @param {string} config.packageName - Package to restrict (e.g., 'proj4', 'cesium')
 * @param {string[]} [config.allowedPaths] - Glob patterns for allowed file paths (rule doesn't apply here)
 * @param {string[]} [config.includePaths] - Glob patterns for included file paths (rule ONLY applies here)
 * @param {string} [config.wrapperPackage] - Single wrapper package name (e.g., '@carma/geo/proj')
 * @param {string[]} [config.wrapperPackages] - Multiple wrapper package names
 * @param {string} config.message - Error message to display
 * @param {boolean} [config.allowTypeImports=true] - Allow type-only imports
 * @returns {Object} ESLint rule definition
 */
module.exports = function createRestrictedImportRule(config) {
  const {
    packageName,
    allowedPaths = [],
    includePaths = [],
    wrapperPackage,
    wrapperPackages,
    message,
    allowTypeImports = true,
  } = config;

  const allowedWrapperPackages =
    wrapperPackages || (wrapperPackage ? [wrapperPackage] : []);

  return {
    meta: {
      type: "problem",
      docs: {
        description: `Restrict ${packageName} imports to specific paths`,
        recommended: false,
      },
      messages: {
        restricted: message || `Import of '${packageName}' is restricted.`,
      },
      schema: [],
    },

    create(context) {
      const filename = context.filename || context.getFilename();

      // If includePaths is specified, ONLY apply rule to those paths
      if (includePaths.length > 0) {
        const isInIncludedPath = includePaths.some((pattern) =>
          minimatch(filename, pattern, { matchBase: false })
        );
        if (!isInIncludedPath) {
          return {};
        }
      }

      // Check if current file is in an allowed path (rule doesn't apply)
      const isInAllowedPath = allowedPaths.some((pattern) =>
        minimatch(filename, pattern, { matchBase: false })
      );

      // Check if current file is within a wrapper package
      const isInWrapperPackage =
        allowedWrapperPackages.length > 0 &&
        allowedWrapperPackages.some((wrapperPkg) => {
          let dir = path.dirname(filename);
          while (dir !== path.dirname(dir)) {
            const pkgPath = path.join(dir, "package.json");
            if (fs.existsSync(pkgPath)) {
              try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
                return pkg.name === wrapperPkg;
              } catch (e) {
                return false;
              }
            }
            dir = path.dirname(dir);
          }
          return false;
        });

      // Skip rule entirely for allowed files
      if (isInAllowedPath || isInWrapperPackage) {
        return {};
      }

      return {
        ImportDeclaration(node) {
          const importPath = node.source.value;

          // Check if this import is for the restricted package
          const isRestrictedImport =
            importPath === packageName ||
            importPath.startsWith(`${packageName}/`);

          if (!isRestrictedImport) {
            return;
          }

          // Allow type-only imports if configured
          if (allowTypeImports && node.importKind === "type") {
            return;
          }

          // Check for type-only specifiers (import type { Foo } from 'pkg')
          if (
            allowTypeImports &&
            node.specifiers.every((spec) => spec.importKind === "type")
          ) {
            return;
          }

          context.report({
            node: node.source,
            messageId: "restricted",
          });
        },

        // Also check dynamic imports: import('package')
        ImportExpression(node) {
          if (node.source.type !== "Literal") {
            return;
          }

          const importPath = node.source.value;
          const isRestrictedImport =
            importPath === packageName ||
            importPath.startsWith(`${packageName}/`);

          if (isRestrictedImport) {
            context.report({
              node: node.source,
              messageId: "restricted",
            });
          }
        },
      };
    },
  };
};
