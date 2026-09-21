const { join } = require("path");
const { workspaceRoot } = require("@nx/devkit");

const preset = require(join(workspaceRoot, "tailwind.preset.cjs"));

module.exports = {
  presets: [preset],
  content: [join(__dirname, "src/**/*!(*.spec).{ts,tsx}")],
};
