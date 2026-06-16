const { join } = require("path");
const { workspaceRoot } = require('@nx/devkit');
const { createGlobPatternsForDependencies } = require("@nx/react/tailwind");

const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

const depsGlobs = createGlobPatternsForDependencies(__dirname);

module.exports = {
  presets: [preset],
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}"),
    ...depsGlobs,
  ],
  // Tailwind's `.collapse` utility (visibility: collapse) collides with
  // Bootstrap's `.collapse` class used by the react-cismap help modal
  // (HelpModal -> GenericModalApplicationMenu accordion panels), which made the
  // expanded panel bodies invisible. We don't use the Tailwind visibility:collapse
  // utility, so block it to resolve the name clash.
  blocklist: ["collapse"],
};
