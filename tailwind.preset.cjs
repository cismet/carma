/* Tailwind preset with global exclusions (merged with app content) */

module.exports = {
  content: ["libraries/!(e2e)/**/src/**/*!(*.spec|*.stories|*.test|*.e2e).{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
