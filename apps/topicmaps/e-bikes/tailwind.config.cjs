const { join } = require("path");
const { workspaceRoot } = require('@nx/devkit');
const { createGlobPatternsForDependencies } = require("@nx/react/tailwind");
const resolveConfig = require('tailwindcss/resolveConfig');
const { inspect } = require('util');

const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

const depsGlobs = createGlobPatternsForDependencies(__dirname);

const config = {
  presets: [preset],
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}"),
    ...depsGlobs,
  ],
};

const resolved = resolveConfig(config);
console.log('[tailwind] resolved content:\n' + inspect(resolved.content, { depth: null, colors: false, maxArrayLength: null }));
console.log('[tailwind] resolved presets:\n' + inspect(resolved.presets, { depth: null, colors: false, maxArrayLength: null }));
module.exports = config;
