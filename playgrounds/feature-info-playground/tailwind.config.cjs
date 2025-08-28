const { join } = require('path');
const { workspaceRoot } = require('@nx/devkit');
const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

const depsGlobs = createGlobPatternsForDependencies(__dirname);

module.exports = {
  presets: [preset],
  content: [
    join(__dirname, 'src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}'),
    ...depsGlobs,
  ],
};
