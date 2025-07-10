/* tailwind.config.cjs */
const path = require("path");

module.exports = {
  content: [
    path.join(__dirname, "./src/**/*.{js,ts,cjs,mjs,tjs,jsx,tsx}"),
    path.join(
      __dirname,
      "../../libraries/mapping/carma-map-layers/src/**/*.{js,ts,jsx,tsx}",
    ),
    path.join(
      __dirname,
      "../../libraries/appframeworks/portals/src/**/*.{js,ts,jsx,tsx}",
      
    ),
    path.join("libraries/**/src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      screens: {
        "xs": "320px",
      },
      spacing: {
        // mobile first standard margins
        'safe-top': 'max(2px, env(safe-area-inset-top))',
        'safe-bottom': 'max(2px, env(safe-area-inset-bottom))',
        'safe-left': 'max(6px, env(safe-area-inset-left))',
        'safe-right': 'max(6px, env(safe-area-inset-right))',
        // xs and above
        'safe-top-xs': 'max(5px, env(safe-area-inset-top))',
        'safe-bottom-xs': 'max(5px, env(safe-area-inset-bottom))',
        'safe-left-xs': 'max(12px, env(safe-area-inset-left))',
        'safe-right-xs': 'max(12px, env(safe-area-inset-right))',
      }
    },
  },
  plugins: [],
};
