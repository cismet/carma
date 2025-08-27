/* tailwind.config.cjs */
const { join } = require("path");

module.exports = {
  // Inherit global content globs and exclusions
  presets: [require(join(__dirname, "../../..", "tailwind.preset.cjs"))],
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{js,jsx,ts,tsx,html}"),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
