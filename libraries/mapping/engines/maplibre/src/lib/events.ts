import type {
  MapEventType,
  MapLayerEventType,
  MapMouseEvent,
  MapTouchEvent,
  MapWheelEvent,
} from "maplibre-gl";

// https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#events

export const MaplibreMapEventNames = {
  // Map lifecycle
  load: "load",
  idle: "idle",
  remove: "remove",
  error: "error",

  // Rendering & context
  render: "render",
  resize: "resize",
  webglcontextlost: "webglcontextlost",
  webglcontextrestored: "webglcontextrestored",

  // Data & style
  dataloading: "dataloading",
  data: "data",
  dataabort: "dataabort",
  tiledataloading: "tiledataloading",
  sourcedataloading: "sourcedataloading",
  sourcedata: "sourcedata",
  sourcedataabort: "sourcedataabort",
  styledata: "styledata",
  styledataloading: "styledataloading",
  styleimagemissing: "styleimagemissing",

  // Movement
  movestart: "movestart",
  move: "move",
  moveend: "moveend",
  dragstart: "dragstart",
  drag: "drag",
  dragend: "dragend",
  boxzoomstart: "boxzoomstart",
  boxzoomend: "boxzoomend",
  boxzoomcancel: "boxzoomcancel",
  wheel: "wheel",
  cooperativegestureprevented: "cooperativegestureprevented",

  // Zoom
  zoomstart: "zoomstart",
  zoom: "zoom",
  zoomend: "zoomend",

  // Rotate & pitch
  rotatestart: "rotatestart",
  rotate: "rotate",
  rotateend: "rotateend",
  pitchstart: "pitchstart",
  pitch: "pitch",
  pitchend: "pitchend",

  // Pointer (mouse) events
  mousedown: "mousedown",
  mouseup: "mouseup",
  mousemove: "mousemove",
  mouseover: "mouseover",
  mouseout: "mouseout",
  click: "click",
  dblclick: "dblclick",
  contextmenu: "contextmenu",

  // Touch events
  touchstart: "touchstart",
  touchmove: "touchmove",
  touchend: "touchend",
  touchcancel: "touchcancel",

  // Terrain & projection
  terrain: "terrain",
  projectiontransition: "projectiontransition",
} as const satisfies Record<string, keyof MapEventType>;

export const MaplibreLayerEventNames = {
  click: "click",
  dblclick: "dblclick",
  mousedown: "mousedown",
  mouseup: "mouseup",
  mousemove: "mousemove",
  mouseenter: "mouseenter",
  mouseleave: "mouseleave",
  mouseover: "mouseover",
  mouseout: "mouseout",
  contextmenu: "contextmenu",
  touchstart: "touchstart",
  touchend: "touchend",
  touchcancel: "touchcancel",
} as const satisfies Record<string, keyof MapLayerEventType>;

export const MaplibreMouseEventNames = {
  mousedown: "mousedown",
  mouseup: "mouseup",
  mousemove: "mousemove",
  mouseover: "mouseover",
  mouseout: "mouseout",
  mouseenter: "mouseenter",
  mouseleave: "mouseleave",
  click: "click",
  dblclick: "dblclick",
  contextmenu: "contextmenu",
} as const satisfies Record<string, MapMouseEvent["type"]>;

export const MaplibreTouchEventNames = {
  touchstart: "touchstart",
  touchmove: "touchmove",
  touchend: "touchend",
  touchcancel: "touchcancel",
} as const satisfies Record<string, MapTouchEvent["type"]>;

export const MaplibreWheelEventNames = {
  wheel: "wheel",
} as const satisfies Record<string, MapWheelEvent["type"]>;

export type MaplibreMapEventName =
  (typeof MaplibreMapEventNames)[keyof typeof MaplibreMapEventNames];
export type MaplibreLayerEventName =
  (typeof MaplibreLayerEventNames)[keyof typeof MaplibreLayerEventNames];
export type MaplibreMouseEventName =
  (typeof MaplibreMouseEventNames)[keyof typeof MaplibreMouseEventNames];
export type MaplibreTouchEventName =
  (typeof MaplibreTouchEventNames)[keyof typeof MaplibreTouchEventNames];
export type MaplibreWheelEventName =
  (typeof MaplibreWheelEventNames)[keyof typeof MaplibreWheelEventNames];
