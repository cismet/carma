import type { Tree } from "@nx/devkit";
import { formatFiles } from "@nx/devkit";
import { libraryGenerator as reactLibraryGenerator } from "@nx/react";
import { parsePathInput, getLibrariesSubpaths } from "./utils/path";
import { promptSelect, promptInput, normalizeName, projectNameExists } from "./utils/interactive";

const LIB_FOLDER = "libraries";
const EXCLUDED_FOLDERS = ["collaboration"];
const ERROR_PROJECT_EXISTS = "Project already exists. Choose a different name.";

const DEFAULT_CONFIG = {
  tags: "",
  skipFormat: true,
  skipTsConfig: false,
  skipPackageJson: true,
  minimal: true,
  bundler: "none",
  linter: "eslint",
  unitTestRunner: "vitest",
  style: "css"
};

interface Schema {
  name?: string;
  path?: string;
  directory?: string;
  tags?: string;
  skipTsConfig?: boolean;
  skipPackageJson?: boolean;
  minimal?: boolean;
}

export default async function generator(tree: Tree, schema: Schema) {
  let directory: string;
  let name: string;

  if (schema.path) {
    const parsed = parsePathInput(schema.path, LIB_FOLDER);
    directory = parsed.directory;
    name = parsed.name;
  } else if (schema.directory && schema.name) {
    directory = schema.directory.startsWith(LIB_FOLDER) 
      ? schema.directory 
      : `${LIB_FOLDER}/${schema.directory}`;
    directory = directory.endsWith("/") ? directory : `${directory}/`;
    name = schema.name;
  } else {
    const subpaths = getLibrariesSubpaths(LIB_FOLDER, EXCLUDED_FOLDERS);
    directory = await promptSelect("Select directory for the new library:", subpaths);
    name = await promptInput(
      "Enter library name (leaf only):",
      undefined,
      (val) => val.trim().length > 0 && !val.includes("/")
    );
  }

  const nameSlug = normalizeName(name);

  if (projectNameExists(tree, nameSlug)) {
    throw new Error(`${ERROR_PROJECT_EXISTS.replace("Project", `Project "${nameSlug}"`)}`);
  }

  const tags = schema.tags || generateTagsFromPath(directory);

  await reactLibraryGenerator(tree, {
    name: nameSlug,
    directory: directory.replace(new RegExp(`^${LIB_FOLDER}\/`), ""),
    tags,
    skipFormat: DEFAULT_CONFIG.skipFormat,
    skipTsConfig: schema.skipTsConfig || DEFAULT_CONFIG.skipTsConfig,
    skipPackageJson: DEFAULT_CONFIG.skipPackageJson,
    minimal: schema.minimal !== DEFAULT_CONFIG.minimal,
    bundler: DEFAULT_CONFIG.bundler,
    linter: DEFAULT_CONFIG.linter,
    unitTestRunner: DEFAULT_CONFIG.unitTestRunner,
    style: DEFAULT_CONFIG.style,
    importPath: nameSlug,
  });

  const packageJsonPath = `${directory}${nameSlug}/package.json`;
  if (tree.exists(packageJsonPath)) {
    const packageJson = JSON.parse(tree.read(packageJsonPath)!.toString());
    packageJson.private = true;
    packageJson.name = nameSlug;
    tree.write(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }

  const babelRcPath = `${directory}${nameSlug}/.babelrc`;
  if (tree.exists(babelRcPath)) {
    tree.delete(babelRcPath);
  }

  await formatFiles(tree);

function generateTagsFromPath(directory: string): string {
  const pathParts = directory.replace(new RegExp(`^${LIB_FOLDER}\/`), "").split("/").filter(Boolean);
  return pathParts.join(", ");
}
}
