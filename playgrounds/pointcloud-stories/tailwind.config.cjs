const { join } = require("path");
const { workspaceRoot } = require("@nx/devkit");
const { createGlobPatternsForDependencies } = require("@nx/react/tailwind");

const preset = require(join(workspaceRoot, "tailwind.preset.cjs"));
const dependencyGlobs = createGlobPatternsForDependencies(__dirname);

module.exports = {
  presets: [preset],
  content: [
    join(__dirname, "src/**/*.{js,jsx,ts,tsx,mdx}"),
    join(__dirname, "../ng-topicmap-playground/src/app/pointcloud/**/*.{ts,tsx}"),
    ...dependencyGlobs,
  ],
};
