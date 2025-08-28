const { join } = require("path");
const { workspaceRoot } = require('@nx/devkit');
const { createGlobPatternsForDependencies } = require("@nx/react/tailwind");
const resolveConfig = require('tailwindcss/resolveConfig');
const { inspect } = require('util');

// Use shared preset from workspace root
const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

// Dependency globs via Nx so we pick up dependent libraries correctly
const depsGlobs = createGlobPatternsForDependencies(__dirname);

// Tailwind config
const config = {
  presets: [preset],
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}"),
    ...depsGlobs,
  ],
};


if (process.env.NODE_ENV === 'development') {
  // check resolved config if needed
  // npx nx build geoportal --output-style=stream 2>&1 | tee nx-geoportal-build.log
  // only log for development builds:
  const resolved = resolveConfig(config);
  console.log('[tailwind] resolved content:\n' + inspect(resolved.content, { depth: null, colors: false, maxArrayLength: null }));
  console.log('[tailwind] resolved presets:\n' + inspect(resolved.presets, { depth: null, colors: false, maxArrayLength: null }));
}

module.exports = config;
