/* opt in libraries here*/
module.exports = {
  content: [
    "libraries/(appframeworks|commons|mapping)/**/src/**/*!(*.spec|*.stories|*.test).{tsx}",
    "libraries/collaborations/**/src/**/*!(*.spec|*.stories|*.test).{jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};
