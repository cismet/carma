// Minimal type shim for the raw pannellum library (PoC).
// pannellum ships no type declarations. The `window.pannellum` global is
// augmented in PanoramaLightBox.tsx via `declare global`.

declare module "pannellum";
declare module "pannellum/build/pannellum.css";
