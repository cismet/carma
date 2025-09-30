declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.css" {
  const css: string;
  export default css;
}

// Leaflet plugins without TypeScript types
declare module "leaflet-editable";
declare module "leaflet-draw";

// Augment Leaflet with custom control patched by utils/measure
declare module "leaflet" {
  namespace control {
    function measurePolygon(options?: any): any;
  }
}

// Broaden React useState inference when initialized with null to avoid
// over-narrowing to `never` inside truthy checks without touching source code.
// Note: do not override React types here; rely on tsconfig loosening instead.
