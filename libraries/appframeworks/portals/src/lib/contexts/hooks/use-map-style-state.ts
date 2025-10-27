import { useCallback, useState } from "react";
import type { MapStyleKey } from "../../constants";
import { useHashState } from "../HashStateProvider";

/**
 * Map Style state management hook
 */
export const useMapStyleState = (
  currentMapStyle: React.MutableRefObject<MapStyleKey>,
  initialStyle: MapStyleKey,
  defaultStyle: MapStyleKey,
  mapStyleToCesiumStyleMapping: Record<MapStyleKey, string>,
  onStyleChange?: (newStyle: MapStyleKey) => void
) => {
  const { updateHash } = useHashState();

  // Add reactive state for consumers that need re-renders
  const [currentStyleState, setCurrentStyleState] = useState(
    currentMapStyle.current
  );

  const setCurrentMapStyle = useCallback(
    (style: MapStyleKey) => {
      currentMapStyle.current = style;

      // Update reactive state for consumers that need re-renders
      setCurrentStyleState(style);

      // Trigger callback immediately for immediate updates
      if (onStyleChange) {
        onStyleChange(style);
      }

      // Automatically update hash when style changes
      updateHash(
        {
          mapStyle: style === defaultStyle ? undefined : style,
        },
        { label: "PortalStateProvider:style" }
      );
    },
    [updateHash, defaultStyle, currentMapStyle, onStyleChange]
  );

  const useMapStyle = useCallback(
    () => ({
      current: currentStyleState, // Use reactive state instead of ref
      set: setCurrentMapStyle,
      initial: initialStyle,
      mapStyleToCesiumStyleMapping,
    }),
    [
      initialStyle,
      setCurrentMapStyle,
      currentStyleState, // Depend on state, not ref
      mapStyleToCesiumStyleMapping,
    ]
  );

  return { useMapStyle };
};
