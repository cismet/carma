const path = require('path');
const nx = require('@nx/devkit');
const nxReactTailwind = require('@nx/react/tailwind');

const preset = require(path.join(nx.workspaceRoot, 'tailwind.preset.cjs'));

const depsGlobs = nxReactTailwind.createGlobPatternsForDependencies(__dirname);

module.exports = {
  presets: [preset],
  content: [
    path.join(
      __dirname,
      'src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}'
    ),
    ...depsGlobs,
  ],
};
