import * as fs from "node:fs";
import * as path from "node:path";
import * as parser from "@babel/parser";
import { createRequire } from "node:module";
import type { NodePath } from "@babel/traverse"; // For type safety
import type * as t from "@babel/types"; // For type safety with Babel AST nodes

// Use require for @babel/traverse as it has issues with ES module imports
const require = createRequire(import.meta.url);
const traverse = require("@babel/traverse").default;

const GEOPORTAL_SLICES_DIR = path.join(
  process.cwd(),
  "apps",
  "geoportal",
  "src",
  "app",
  "store",
  "slices"
);

interface SliceInfo {
  fileName: string;
  name: string | null;
  initialStateKeys: string[];
  reducers: string[];
  actions: string[];
}

async function analyzeSliceFile(filePath: string): Promise<SliceInfo> {
  const content = await fs.promises.readFile(filePath, "utf-8");
  const ast = parser.parse(content, {
    sourceType: "module",
    plugins: ["typescript"],
  });

  const sliceInfo: SliceInfo = {
    fileName: path.basename(filePath),
    name: null,
    initialStateKeys: [],
    reducers: [],
    actions: [],
  };

  // First pass: find initialState variable declarations
  let initialStateObject: t.ObjectExpression | null = null;

  traverse(ast, {
    VariableDeclarator(nodePath: NodePath<t.VariableDeclarator>) {
      const { node } = nodePath;
      if (
        node.id.type === "Identifier" &&
        node.id.name === "initialState" &&
        node.init?.type === "ObjectExpression"
      ) {
        initialStateObject = node.init;
      }
    },
  });

  // Second pass: find createSlice call and extract information
  traverse(ast, {
    CallExpression(nodePath: NodePath<t.CallExpression>) {
      const { node } = nodePath;
      if (
        node.callee.type === "Identifier" &&
        node.callee.name === "createSlice"
      ) {
        const configObject = node.arguments[0] as t.ObjectExpression;
        if (configObject && configObject.type === "ObjectExpression") {
          configObject.properties.forEach((prop) => {
            if (prop.type === "ObjectProperty") {
              const key = prop.key as t.Identifier;

              // Extract slice name
              if (key.name === "name" && prop.value.type === "StringLiteral") {
                sliceInfo.name = prop.value.value;
              }

              // Extract initialState keys (handle both inline and reference)
              if (key.name === "initialState") {
                if (prop.value.type === "ObjectExpression") {
                  // Inline initialState
                  prop.value.properties.forEach((isp) => {
                    if (
                      isp.type === "ObjectProperty" &&
                      isp.key.type === "Identifier"
                    ) {
                      sliceInfo.initialStateKeys.push(isp.key.name);
                    }
                  });
                } else if (
                  prop.value.type === "Identifier" &&
                  prop.value.name === "initialState" &&
                  initialStateObject
                ) {
                  // Reference to initialState variable
                  initialStateObject.properties.forEach((isp) => {
                    if (
                      isp.type === "ObjectProperty" &&
                      isp.key.type === "Identifier"
                    ) {
                      sliceInfo.initialStateKeys.push(isp.key.name);
                    }
                  });
                }
              }

              // Extract reducers
              if (
                key.name === "reducers" &&
                prop.value.type === "ObjectExpression"
              ) {
                prop.value.properties.forEach((rp) => {
                  if (
                    rp.type === "ObjectProperty" &&
                    rp.key.type === "Identifier"
                  ) {
                    const reducerName = rp.key.name;
                    sliceInfo.reducers.push(reducerName);
                    sliceInfo.actions.push(reducerName);
                  }
                });
              }
            }
          });
        }
      }
    },
  });

  return sliceInfo;
}

function generateMarkdownStructure(slicesData: SliceInfo[]): string {
  let markdown = "";

  slicesData.forEach((slice) => {
    if (!slice.name) return;

    markdown += `### 📦 ${slice.name} slice\n\n`;
    markdown += `_Source: [${slice.fileName}](src/app/store/slices/${slice.fileName})_\n\n`;

    if (slice.initialStateKeys.length > 0) {
      const sortedStates = [...slice.initialStateKeys].sort((a, b) =>
        a.localeCompare(b)
      );
      markdown += `**State Properties:**\n`;
      sortedStates.forEach((key) => {
        markdown += `- \`${key}\`\n`;
      });
      markdown += "\n";
    }

    if (slice.actions.length > 0) {
      const sortedActions = [...slice.actions].sort((a, b) =>
        a.localeCompare(b)
      );
      markdown += `**Actions:**\n`;
      sortedActions.forEach((action) => {
        markdown += `- \`${action}()\`\n`;
      });
      markdown += "\n";
    }
  });

  return markdown;
}

async function main() {
  try {
    const files = await fs.promises.readdir(GEOPORTAL_SLICES_DIR);
    const sliceFiles = files.filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".d.ts")
    );

    const allSlicesData: SliceInfo[] = [];
    for (const file of sliceFiles) {
      const filePath = path.join(GEOPORTAL_SLICES_DIR, file);
      try {
        const sliceData = await analyzeSliceFile(filePath);
        if (sliceData.name) {
          allSlicesData.push(sliceData);
        } else {
          console.warn(
            `// Warning: Could not fully parse slice name or structure in ${file}`
          );
        }
      } catch (error: unknown) {
        console.error(
          `// Error analyzing ${file}: ${(error as Error).message}`
        );
      }
    }

    console.log(
      "//////////////////// Geoportal Redux Slices Overview (JSON) ////////////////////"
    );
    console.log(JSON.stringify(allSlicesData, null, 2));
    console.log(
      "\n//////////////////////////////////////////////////////////////////////////////////\n"
    );

    console.log(
      "//////////////////// Redux Store Structure (Markdown) ////////////////////"
    );
    const markdownStructure = generateMarkdownStructure(allSlicesData);
    console.log(markdownStructure);
    console.log(
      "\n////////////////////////////////////////////////////////////////////\n"
    );
  } catch (error: unknown) {
    const err = error as Error & { code?: string; path?: string };
    if (err.code === "ENOENT" && err.path === GEOPORTAL_SLICES_DIR) {
      console.error(`Error: Directory not found: ${GEOPORTAL_SLICES_DIR}`);
      console.error(
        "Please ensure you are running this script from the workspace root and the geoportal app structure is correct."
      );
    } else if (err.message.includes("Cannot find module '@babel/parser'")) {
      console.error(
        "Error: Required module '@babel/parser' or '@babel/traverse' not found."
      );
      console.error(
        "Please install them by running: npm install --save-dev @babel/parser @babel/traverse @types/babel__traverse @types/babel__core"
      );
    } else {
      console.error("An unexpected error occurred:", error);
    }
    process.exit(1);
  }
}

main();
