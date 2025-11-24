import L from "leaflet";

export { LeafletMapStateChangeEvents } from "./lib/events";
export * from "./lib/LatLng";
export * from "./lib/Map";

// Re-exports from Leaflet
export const Browser = L.Browser;

export const Control = L.Control;
export type Control = L.Control;
export type ControlOptions = L.ControlOptions;

export const DomEvent = L.DomEvent;
export const DomUtil = L.DomUtil;

export const latLngBounds = L.latLngBounds;
export const LatLngBounds = L.LatLngBounds;
export type LatLngBounds = L.LatLngBounds;

export const Layer = L.Layer;
export type Layer = L.Layer;

export const layerGroup = L.layerGroup;
export const LayerGroup = L.LayerGroup;
export type LayerGroup = L.LayerGroup;

export const LeafletControl = L.Control;
export type LeafletControl = L.Control;

export type LeafletEvent = L.LeafletEvent;
export type LeafletMouseEvent = L.LeafletMouseEvent;

export const point = L.point;
export const Point = L.Point;
export type Point = L.Point;

export const polygon = L.polygon;
export const Polygon = L.Polygon;
export type Polygon = L.Polygon;

export const polyline = L.polyline;
export const Polyline = L.Polyline;
export type Polyline = L.Polyline;
