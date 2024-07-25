/* tailwind.config.cjs */
const path = require('path');

module.exports = {
  content: [path.join(__dirname, './src/**/*.{js,ts,cjs,mjs,mts,jsx,tsx}')],
  theme: {
    extend: {},
  },
  plugins: [],
};
