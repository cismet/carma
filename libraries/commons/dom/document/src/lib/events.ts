// Document-specific event names with proper typing
// https://developer.mozilla.org/en-US/docs/Web/API/Document#events

export const DocumentEventNames = {
  // Keyboard events
  keydown: "keydown", // KeyboardEvent - Fired when a key is pressed
  keyup: "keyup", // KeyboardEvent - Fired when a key is released
  keypress: "keypress", // KeyboardEvent - Deprecated, fired when a key that produces a character value is pressed

  // Mouse events
  mousedown: "mousedown", // MouseEvent
  mouseup: "mouseup", // MouseEvent
  mousemove: "mousemove", // MouseEvent
  mouseenter: "mouseenter", // MouseEvent
  mouseleave: "mouseleave", // MouseEvent
  mouseover: "mouseover", // MouseEvent
  mouseout: "mouseout", // MouseEvent
  click: "click", // MouseEvent
  dblclick: "dblclick", // MouseEvent
  contextmenu: "contextmenu", // MouseEvent

  // Pointer events
  pointerdown: "pointerdown", // PointerEvent
  pointerup: "pointerup", // PointerEvent
  pointermove: "pointermove", // PointerEvent
  pointercancel: "pointercancel", // PointerEvent
  pointerenter: "pointerenter", // PointerEvent
  pointerleave: "pointerleave", // PointerEvent
  pointerover: "pointerover", // PointerEvent
  pointerout: "pointerout", // PointerEvent

  // Touch events
  touchstart: "touchstart", // TouchEvent
  touchend: "touchend", // TouchEvent
  touchmove: "touchmove", // TouchEvent
  touchcancel: "touchcancel", // TouchEvent

  // Focus events (element-level)
  focus: "focus", // FocusEvent
  blur: "blur", // FocusEvent
  focusin: "focusin", // FocusEvent - Bubbles, unlike focus
  focusout: "focusout", // FocusEvent - Bubbles, unlike blur

  // Input events
  input: "input", // InputEvent - Fired when the value of an input element changes
  change: "change", // Event - Fired when a change is committed to an input element
  beforeinput: "beforeinput", // InputEvent - Fired before the value is modified

  // Form events
  submit: "submit", // SubmitEvent
  reset: "reset", // Event

  // Drag events
  drag: "drag", // DragEvent
  dragstart: "dragstart", // DragEvent
  dragend: "dragend", // DragEvent
  dragenter: "dragenter", // DragEvent
  dragleave: "dragleave", // DragEvent
  dragover: "dragover", // DragEvent
  drop: "drop", // DragEvent

  // Clipboard events
  copy: "copy", // ClipboardEvent
  cut: "cut", // ClipboardEvent
  paste: "paste", // ClipboardEvent

  // Selection events
  select: "select", // Event
  selectionchange: "selectionchange", // Event
  selectstart: "selectstart", // Event

  // Scroll events (document-level)
  scroll: "scroll", // Event - Fired when the document view is scrolled
  scrollend: "scrollend", // Event - Fired when scrolling has completed

  // Document lifecycle
  DOMContentLoaded: "DOMContentLoaded", // Event - Fired when HTML is loaded and parsed
  readystatechange: "readystatechange", // Event - Fired when the readyState attribute changes

  // Page visibility
  visibilitychange: "visibilitychange", // Event - Fired when the content of a tab becomes visible or hidden

  // Fullscreen events
  fullscreenchange: "fullscreenchange", // Event
  fullscreenerror: "fullscreenerror", // Event

  // Pointer lock events
  pointerlockchange: "pointerlockchange", // Event
  pointerlockerror: "pointerlockerror", // Event
} as const;

export type DocumentEventName =
  (typeof DocumentEventNames)[keyof typeof DocumentEventNames];
