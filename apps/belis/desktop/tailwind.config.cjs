const { join } = require("path");
const { workspaceRoot } = require('@nx/devkit');
const { createGlobPatternsForDependencies } = require("@nx/react/tailwind");

const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

const depsGlobs = createGlobPatternsForDependencies(__dirname);

module.exports = {
  presets: [preset],
  // Make Tailwind utilities `!important` so they can win the cascade against
  // Bootstrap 4's own `!important` utility classes (`.mx-3`, `.border`, ...)
  // loaded by the HelpModal. Combined with the `tw`-before-`vendor` layer order
  // in styles.css, the earlier `tw` layer wins for `!important` declarations, so
  // Bootstrap can no longer inflate the app shell's Tailwind spacing. Same
  // approach as the sibling verdis/lagis apps that mix Bootstrap with Tailwind.
  important: true,
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}"),
    ...depsGlobs,
  ],
  // Tailwind's `.collapse` utility (visibility: collapse) collides with
  // Bootstrap's `.collapse` class used by the lazily-loaded HelpModal accordion
  // (HelpModal -> GenericModalApplicationMenu panels), which made the expanded
  // panel bodies invisible. We don't use the Tailwind visibility:collapse
  // utility, so block it to resolve the name clash.
  blocklist: ["collapse"],
};
