// https://leafletjs.com/reference.html#map-map-state-change-events

export enum LeafletMapStateChangeEvents {
  zoomlevelschange = "zoomlevelschange", //	Event	Fired when the number of zoom levels on the map is changed due to adding or removing a layer.
  resize = "resize", //	ResizeEvent	Fired when the map is resized.
  unload = "unload", //	Event	Fired when the map is destroyed with remove method.
  viewreset = "viewreset", //	Event	Fired when the map needs to redraw its content (this usually happens on map zoom or load). Very useful for creating custom overlays.
  load = "load", //	Event	Fired when the map is initialized (when its center and zoom are set for the first time).
  zoomstart = "zoomstart", //	Event	Fired when the map zoom is about to change (e.g. before zoom animation).
  movestart = "movestart", //	Event	Fired when the view of the map starts changing (e.g. user starts dragging the map).
  zoom = "zoom", //	Event	Fired repeatedly during any change in zoom level, including zoom and fly animations.
  move = "move", //	Event	Fired repeatedly during any movement of the map, including pan and fly animations.
  zoomend = "zoomend", //	Event	Fired when the map zoom changed, after any animations.
  moveend = "moveend", //	Event	Fired when the map view stopped changing (e.g. user stopped dragging the map).
}
