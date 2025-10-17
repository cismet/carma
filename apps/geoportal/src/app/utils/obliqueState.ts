/**
 * Oblique mode event bus
 * App-scoped event system for oblique mode coordination
 * Independent of React tree and cesium-engine library
 */

import { createEventBus } from "@carma/providers/event-bus";

/**
 * All oblique mode events
 */
export type ObliqueEventMap = {
  toggle: boolean; // Toggle mode on/off (payload = new state)
  enterPreview: void; // Enter preview mode
  leavePreview: void; // Exit preview mode
  selectImage: string | null; // Select image by ID (null = deselect)
  // Add more events as needed
};

/**
 * App-level oblique event bus
 * Use this to coordinate oblique mode across components
 */
export const obliqueEventBus = createEventBus<ObliqueEventMap>();

/**
 * Convenience functions for common actions
 */
export const toggleObliqueMode = (state: boolean) => {
  obliqueEventBus.emit("toggle", state);
};

export const enterObliquePreview = () => {
  obliqueEventBus.emit("enterPreview", undefined);
};

export const leaveObliquePreview = () => {
  obliqueEventBus.emit("leavePreview", undefined);
};
