// Window-specific event names with proper typing
// https://developer.mozilla.org/en-US/docs/Web/API/Window#events

export const WindowEventNames = {
  // Focus events (window-level)
  blur: "blur", // FocusEvent - Fired when the window loses focus
  focus: "focus", // FocusEvent - Fired when the window gains focus

  // Load events
  load: "load", // Event - Fired when the whole page has loaded
  beforeunload: "beforeunload", // BeforeUnloadEvent - Fired when the window is about to be unloaded
  unload: "unload", // Event - Fired when the document or a child resource is being unloaded

  // Resize and scroll (window-level)
  resize: "resize", // UIEvent - Fired when the window is resized
  scroll: "scroll", // Event - Fired when the window is scrolled

  // Message events
  message: "message", // MessageEvent - Fired when the window receives a message
  messageerror: "messageerror", // MessageEvent - Fired when the window receives a message that can't be deserialized

  // Storage events
  storage: "storage", // StorageEvent - Fired when a storage area (localStorage or sessionStorage) has been modified

  // Error events
  error: "error", // ErrorEvent - Fired when a resource failed to load or an error occurred

  // Hash change
  hashchange: "hashchange", // HashChangeEvent - Fired when the fragment identifier of the URL has changed

  // Page transition
  pageshow: "pageshow", // PageTransitionEvent - Fired when a page is shown
  pagehide: "pagehide", // PageTransitionEvent - Fired when a page is hidden

  // Pop state
  popstate: "popstate", // PopStateEvent - Fired when the active history entry changes

  // Online/Offline
  online: "online", // Event - Fired when the browser has gained access to the network
  offline: "offline", // Event - Fired when the browser has lost access to the network

  // Language change
  languagechange: "languagechange", // Event - Fired when the user's preferred languages change

  // Orientation change (mobile)
  orientationchange: "orientationchange", // Event - Fired when the device orientation changes

  // Device motion/orientation
  devicemotion: "devicemotion", // DeviceMotionEvent
  deviceorientation: "deviceorientation", // DeviceOrientationEvent
} as const;

export type WindowEventName =
  (typeof WindowEventNames)[keyof typeof WindowEventNames];
