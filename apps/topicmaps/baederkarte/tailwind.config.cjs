/* tailwind.config.cjs */
const path = require("path");

module.exports = {
  content: [
    path.join(__dirname, "./src/**/*.{js,ts,cjs,mjs,tjs,jsx,tsx}"),
    path.join("libraries/**/src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      spacing: {
        'safe-top': 'max(5px, env(safe-area-inset-top))',
        'safe-bottom': 'max(5px, env(safe-area-inset-bottom))',
        'safe-left': 'max(12px, env(safe-area-inset-left))',
        'safe-right': 'max(12px, env(safe-area-inset-right))',
      },
    },
  },
  plugins: [],
};
