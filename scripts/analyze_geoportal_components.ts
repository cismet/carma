import * as fs from "node:fs";
import * as path from "node:path";
import * as parser from "@babel/parser";
import { createRequire } from "node:module";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

const require = createRequire(import.meta.url);
const traverse = require("@babel/traverse").default;

const GEOPORTAL_SRC_DIR = path.join(process.cwd(), "apps", "geoportal", "src");

interface ComponentInfo {
  name: string;
  filePath: string;
  relativePath: string;
  imports: string[];
  hooks: string[];
  providers: string[];
  keyComponents: string[];
}

async function analyzeComponentFile(filePath: string): Promise<ComponentInfo> {
  const content = await fs.promises.readFile(filePath, "utf-8");
  const ast = parser.parse(content, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const relativePath = path.relative(GEOPORTAL_SRC_DIR, filePath);
  const componentInfo: ComponentInfo = {
    name: path.basename(filePath, path.extname(filePath)),
    filePath,
    relativePath,
    imports: [],
    hooks: [],
    providers: [],
    keyComponents: [],
  };

  // Analyze imports
  traverse(ast, {
    ImportDeclaration(nodePath: NodePath<t.ImportDeclaration>) {
      const source = nodePath.node.source.value;
      componentInfo.imports.push(source);
    },

    // Look for hook usage (functions starting with 'use')
    CallExpression(nodePath: NodePath<t.CallExpression>) {
      const { node } = nodePath;
      if (
        node.callee.type === "Identifier" &&
        node.callee.name.startsWith("use")
      ) {
        if (!componentInfo.hooks.includes(node.callee.name)) {
          componentInfo.hooks.push(node.callee.name);
        }
      }
    },

    // Look for JSX elements (components)
    JSXElement(nodePath: NodePath<t.JSXElement>) {
      const openingElement = nodePath.node.openingElement;
      if (openingElement.name.type === "JSXIdentifier") {
        const elementName = openingElement.name.name;

        // Track providers
        if (elementName.includes("Provider")) {
          if (!componentInfo.providers.includes(elementName)) {
            componentInfo.providers.push(elementName);
          }
        }

        // Track other key components
        const keyComponentPatterns = [
          "MapWrapper",
          "TopNavbar",
          "Modal",
          "ErrorBoundary",
          "MapMeasurement",
          "FeatureFlagProvider",
          "TweakpaneProvider",
        ];

        if (
          keyComponentPatterns.some((pattern) => elementName.includes(pattern))
        ) {
          if (!componentInfo.keyComponents.includes(elementName)) {
            componentInfo.keyComponents.push(elementName);
          }
        }
      }
    },
  });

  return componentInfo;
}

function generateComponentDiagram(mainAppInfo: ComponentInfo): string {
  let markdown = "```mermaid\n";
  markdown += "graph TD\n";
  markdown += "    %% Application Structure\n";
  markdown += "    App[App.tsx]\n";
  markdown += "    click App \"https://github.com/cismet/carma/blob/main/apps/geoportal/src/app/App.tsx\"\n\n";

  // URL parsing and initialization hooks
  const urlHooks = mainAppInfo.hooks.filter(
    (hook) =>
      hook.includes("SearchParams") ||
      hook.includes("Token") ||
      hook.includes("ManageLayers") ||
      hook.includes("Config")
  );

  if (urlHooks.length > 0) {
    markdown += "    %% Initialization Hooks\n";
    markdown += "    Init[Initialization Hooks]\n";
    markdown += "    App --> Init\n\n";
  }

  // Provider hierarchy (from outer to inner)
  markdown += "    %% Provider Hierarchy\n";
  const providerOrder = [
    "FeatureFlagProvider",
    "TweakpaneProvider",
    "CarmaMapProviderWrapper",
    "ObliqueProvider",
    "CrossTabCommunicationContextProvider",
    "ErrorBoundary",
  ];

  let prevNode = "App"; // Changed from prevProvider for clarity
  providerOrder.forEach((providerName) => {
    if (
      mainAppInfo.providers.includes(providerName) ||
      mainAppInfo.keyComponents.includes(providerName)
    ) {
      markdown += `    ${providerName}[${providerName}]\n`;
      // Note: Click handlers for these top-level providers could be added if their file paths were known/derived
      markdown += `    ${prevNode} --> ${providerName}\n`;
      prevNode = providerName;

      if (providerName === "CarmaMapProviderWrapper") {
        markdown += "\n    %% CarmaMapProviderWrapper internal providers (in situ)\n";
        markdown += "    subgraph CarmaMapGroup[\"CarmaMapProviderWrapper Context\"]\n";
        const carmaMapInternalProviders = [
          "GazDataProvider",
          "SelectionProvider",
          "TopicMapContextProvider",
          "OverlayTourProvider",
          "CesiumContextProvider",
        ];
        // Define all internal providers within the subgraph
        carmaMapInternalProviders.forEach(internalProvider => {
          markdown += `        ${internalProvider}[${internalProvider}]\n`;
        });
        markdown += "    end\n";
        
        // Create connections: CarmaMapProviderWrapper -> first internal provider
        markdown += `    ${prevNode} --> ${carmaMapInternalProviders[0]}\n`;
        
        // Chain internal providers together
        for (let i = 0; i < carmaMapInternalProviders.length - 1; i++) {
          markdown += `    ${carmaMapInternalProviders[i]} --> ${carmaMapInternalProviders[i + 1]}\n`;
        }
        
        // Update prevNode to the last internal provider for the next connection
        prevNode = carmaMapInternalProviders[carmaMapInternalProviders.length - 1];
      }
    }
  });

  // Main UI Components - arranged hierarchically 
  markdown += "\n    %% Main UI Components\n";
  const uiComponents = [
    { name: "TopNavbar", path: "app/components/TopNavbar/" },
    { name: "MapWrapper", path: "app/components/GeoportalMap/controls/MapWrapper.tsx" },
    { name: "MapMeasurement", path: "app/components/" },
    { name: "Modal", path: "app/" },
  ];

  // Create UI components hierarchically
  let uiPrevNode = prevNode; // Start from the last provider (ErrorBoundary)
  uiComponents.forEach((comp) => {
    markdown += `    ${comp.name}[${comp.name}]\n`;
    if (comp.path) {
      markdown += `    click ${comp.name} \"https://github.com/cismet/carma/blob/main/apps/geoportal/src/${comp.path}\"\n`;
    }
    markdown += `    ${uiPrevNode} --> ${comp.name}\n`;
    uiPrevNode = comp.name; // Chain UI components together
  });

  markdown += "```\n\n";

  // Add text description
  markdown += "**Application Structure Overview:**\n\n";
  markdown += "1. **App.tsx** - Main application entry point with provider setup\n";
  markdown += "2. **Initialization Hooks** - Parse URL parameters and load configuration:\n";
  urlHooks.forEach((hook) => {
    markdown += `   - \`${hook}\`\n`;
  });
  markdown += "3. **Provider Hierarchy** - Context providers wrapping the application\n";
  markdown += "4. **CarmaMapProviderWrapper** - Wraps multiple mapping-related providers:\n";
  markdown += "   - `GazDataProvider` - Gazetteer search data\n";
  markdown += "   - `SelectionProvider` - Feature selection state\n";
  markdown += "   - `TopicMapContextProvider` - Map context and configuration\n";
  markdown += "   - `OverlayTourProvider` - Help overlay system\n";
  markdown += "   - `CesiumContextProvider` - 3D mapping engine\n";
  markdown += "5. **Main UI Components** - Core application interface\n\n";

  markdown += "**Key Source Files:**\n\n";
  markdown += "- [`app/App.tsx`](src/app/App.tsx) - Main application entry point\n";
  markdown += "- [`app/hooks/`](src/app/hooks/) - Initialization and configuration hooks\n";
  markdown += "- [`app/components/GeoportalMap/`](src/app/components/GeoportalMap/) - Map-related components\n";
  markdown += "- [`app/components/TopNavbar/`](src/app/components/TopNavbar/) - Navigation components\n";
  markdown += "- [`app/store/slices/`](src/app/store/slices/) - Redux state management\n\n";

  return markdown;
}

async function findMainFiles(): Promise<ComponentInfo[]> {
  const mainFiles = [
    "app/App.tsx",
    "app/components/MapWrapper.tsx",
    "app/components/TopNavbar.tsx",
  ];

  const components: ComponentInfo[] = [];

  for (const file of mainFiles) {
    const fullPath = path.join(GEOPORTAL_SRC_DIR, file);
    try {
      if (
        await fs.promises
          .access(fullPath)
          .then(() => true)
          .catch(() => false)
      ) {
        const componentInfo = await analyzeComponentFile(fullPath);
        components.push(componentInfo);
      }
    } catch (error) {
      console.warn(`Could not analyze ${file}: ${(error as Error).message}`);
    }
  }

  return components;
}

async function main() {
  try {
    console.log(
      "//////////////////// Geoportal Component Analysis ////////////////////"
    );

    const components = await findMainFiles();
    const mainApp = components.find((c) => c.name === "App");

    if (!mainApp) {
      console.error("Could not find main App.tsx component");
      process.exit(1);
    }

    console.log(JSON.stringify(components, null, 2));
    console.log(
      "\n////////////////////////////////////////////////////////////////////\n"
    );

    console.log(
      "//////////////////// Component Structure Diagram ////////////////////"
    );
    const diagram = generateComponentDiagram(mainApp);
    console.log(diagram);
    console.log(
      "////////////////////////////////////////////////////////////////////"
    );
  } catch (error: unknown) {
    console.error("An error occurred during component analysis:", error);
    process.exit(1);
  }
}

main();
