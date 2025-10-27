import { useEffect, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MapStyleKeys, usePortalMapStyle } from "@carma-appframeworks/portals";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
  getBackgroundLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

/**
 * PortalReduxSyncProvider - Reactive sync from PortalContext to Redux
 *
 * This component syncs map style changes from PortalContext to Redux
 * whenever they occur (from URL, TopNavbar, or other Portal components).
 *
 * Architecture:
 *   TopNavbar (changes PortalContext only)
 *     ↓
 *   PortalContext (URL + reactive state)
 *     ↓
 *   PortalReduxSyncProvider (forwards to Redux) ← THIS COMPONENT
 *     ↓
 *   TopicMap (uses Redux for layer logic)
 *
 * This keeps Portal components Redux-free while maintaining backward
 * compatibility with TopicMap's Redux-based layer management.
 */
export const PortalReduxSyncProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const dispatch = useDispatch();
  const { current: currentMapStyle } = usePortalMapStyle();

  // Redux selectors
  const selectedMapLayer = useSelector((state: RootState) =>
    getSelectedMapLayer(state)
  );
  const selectedLuftbildLayer = useSelector((state: RootState) =>
    getSelectedLuftbildLayer(state)
  );
  const backgroundLayer = useSelector((state: RootState) =>
    getBackgroundLayer(state)
  );

  // One-way sync: Portal → Redux (ONLY when Portal state changes)
  useEffect(() => {
    if (!currentMapStyle) return;

    console.log(
      "[PortalReduxSyncProvider] Portal style changed, syncing to Redux:",
      currentMapStyle
    );

    if (currentMapStyle === MapStyleKeys.TOPO) {
      dispatch(
        setBackgroundLayer({
          ...selectedMapLayer,
          id: MapStyleKeys.TOPO,
          visible: backgroundLayer.visible,
          opacity: backgroundLayer.opacity,
        })
      );
    } else if (currentMapStyle === MapStyleKeys.AERIAL) {
      dispatch(
        setBackgroundLayer({
          ...selectedLuftbildLayer,
          id: MapStyleKeys.AERIAL,
          visible: backgroundLayer.visible,
          opacity: backgroundLayer.opacity,
        })
      );
    }

    console.log(
      "[PortalReduxSyncProvider] Redux synced - TopicMap should update"
    );
    // IMPORTANT: ONLY react to currentMapStyle (Portal is the source)
    // Redux values are READ but NOT in dependencies (one-way sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMapStyle, dispatch]);

  return <>{children}</>;
};
