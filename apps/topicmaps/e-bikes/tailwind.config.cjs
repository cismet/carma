const { join } = require("path");

module.exports = {
  presets: [join(__dirname, "../../..", "tailwind.preset.cjs")],
  content: [
    join(__dirname, "src/**/*!(*.stories|*.spec|*.test).{tsx}"),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
