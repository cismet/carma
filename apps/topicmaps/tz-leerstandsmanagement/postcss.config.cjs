/* postcss.config.cjs */
const path = require("path");

module.exports = {
  plugins: {
    "postcss-import": {},
    "tailwindcss/nesting": {},
    tailwindcss: {
      config: path.join(__dirname, "tailwind.config.cjs"),
    },
    autoprefixer: {},
  },
};
