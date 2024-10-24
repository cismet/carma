/* postcss.config.cjs */
const path = require('path');

module.exports = {
  plugins: {
    tailwindcss: {
      config: path.join(__dirname, 'tailwind.config.cjs'),
    },
    autoprefixer: {},
  },
};
