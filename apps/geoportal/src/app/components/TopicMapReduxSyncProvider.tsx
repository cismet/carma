import { useEffect, useCallback, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  MapStyleKeys,
  usePortalContext,
  type MapStyleKey,
} from "@carma-appframeworks/portals";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
  getBackgroundLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

/**
 * TopicMapReduxSyncProvider - Bidirectional sync between PortalContext and Redux
 *
 * This component provides TWO synchronization paths:
 *
 * 1. **TopicMap → Redux (via callback)**
 *    - TopicMap (legacy cismap) calls registered callback when style changes
 *    - Callback updates Redux backgroundLayer state
 *
 * 2. **Portal → Redux (reactive)**
 *    - When PortalContext mapStyleRef changes (from URL, TopNavbar, etc.)
 *    - Automatically syncs to Redux for TopicMap consumption
 *
 * Architecture:
 *   URL / TopNavbar → PortalContext → THIS COMPONENT → Redux → TopicMap
 *   TopicMap → Callback → THIS COMPONENT → Redux
 *
 * This keeps Portal components Redux-free while maintaining backward
 * compatibility with TopicMap's Redux-based layer management.
 */
export const TopicMapReduxSyncProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const dispatch = useDispatch();
  const { getMapStyle, setTopicMapSyncCallback } = usePortalContext();

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

  // Path 1: TopicMap callback (TopicMap → Redux)
  const handleTopicMapSync = useCallback(
    (styleId: MapStyleKey) => {
      console.log(
        "[TopicMapReduxSyncProvider] TopicMap callback triggered for style:",
        styleId
      );

      if (styleId === MapStyleKeys.TOPO) {
        dispatch(
          setBackgroundLayer({
            ...selectedMapLayer,
            id: MapStyleKeys.TOPO,
            visible: backgroundLayer.visible,
            opacity: backgroundLayer.opacity,
          })
        );
      } else if (styleId === MapStyleKeys.AERIAL) {
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
        "[TopicMapReduxSyncProvider] TopicMap sync completed - Redux updated"
      );
    },
    [dispatch, selectedMapLayer, selectedLuftbildLayer, backgroundLayer]
  );

  // Register TopicMap callback with PortalContext
  useEffect(() => {
    setTopicMapSyncCallback(handleTopicMapSync);
  }, [handleTopicMapSync, setTopicMapSyncCallback]);

  // Path 2: Reactive sync (Portal → Redux)
  useEffect(() => {
    const currentMapStyle = getMapStyle();
    if (!currentMapStyle) return;

    console.log(
      "[TopicMapReduxSyncProvider] Portal style changed, syncing to Redux:",
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
      "[TopicMapReduxSyncProvider] Redux synced - TopicMap should update"
    );
    // IMPORTANT: ONLY react to getMapStyle() (Portal is the source)
    // Redux values are READ but NOT in dependencies (one-way sync from Portal)
    // Note: getMapStyle is stable (memoized), so we include it to track changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getMapStyle, dispatch]);

  return <>{children}</>;
};
