import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { SceneStyleConfig } from "@carma/cesium/types";
// Event system removed - using direct ref manipulation instead

/**
 * Custom hook that manages all event subscriptions for CesiumContext refs.
 * Consolidates subscription logic to keep CesiumContextProvider clean.
 *
 * Architecture:
 * - External consumers emit events via the bus (SetSceneStyle, ToggleSceneStyle, GoHome, etc)
 * - Context receives events and handles them appropriately:
 *
 * **Style Changes** (Scene Coordination): Uses callback pattern
 *   - Context calls registered callback: sceneStyleApplierRef.current(styleId)
 *   - Scene hook registers callback on mount
 *   - This is for scene lifecycle coordination
 *
 * **Commands** (Direct Execution): Context manipulates scene directly
 *   - GoHome: Context directly flies camera using sceneRef
 *   - Suspend/Activate: Context updates isSuspendedRef
 *   - These are one-time commands, not lifecycle coordination
 */
export const useContextSetupSubscriptions = ({
  sceneRef,
  isSuspendedRef,
  isAnimatingRef,
  currentSceneStyleRef,
  sceneStyleApplierRef,
  homeCamera,
  sceneStyle,
}: {
  sceneRef: MutableRefObject<any>; // Scene | null | false
  isSuspendedRef: MutableRefObject<boolean>;
  isAnimatingRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;
  sceneStyleApplierRef: MutableRefObject<((styleId: string) => void) | null>;
  homeCamera: MutableRefObject<any>; // CameraPoseRadians | null
  sceneStyle?: SceneStyleConfig;
}) => {
  // Event subscriptions removed - using direct ref manipulation instead

  // Animation state management removed - using direct ref manipulation instead

  // GoHome event handling removed - using direct ref manipulation instead

  // Camera controller setting events removed - using direct ref manipulation instead

  // Style change events removed - using direct ref manipulation instead

  // Tileset visibility/opacity events removed - using direct ref manipulation instead

  // Home position events removed - using direct ref manipulation instead
};
