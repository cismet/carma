const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');
const { workspaceRoot } = require('@nx/devkit');

const preset = require(join(workspaceRoot, 'tailwind.preset.cjs'));

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    join(__dirname, 'src/**/*!(*.stories|*.spec|*.test).{js,ts,jsx,tsx}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1677ff',
      },
      screens: {
        '3xl': '2560px',
      },
      backgroundImage: {
        rain: "url('/images/background.jpg')",
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  important: true,
};
