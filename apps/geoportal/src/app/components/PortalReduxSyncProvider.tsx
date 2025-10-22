import { useEffect, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MapStyleKeys, usePortal } from "@carma-appframeworks/portals";
import {
  setBackgroundLayer,
  getSelectedMapLayer,
  getSelectedLuftbildLayer,
  getBackgroundLayer,
} from "../store/slices/mapping";
import type { RootState } from "../store";

/**
 * PortalReduxSyncProvider - Centralized Redux synchronization for Portal state
 *
 * This component sits between PortalProvider and the app components to sync
 * Portal context state to Redux. This keeps Redux imports isolated to this one
 * component instead of scattered throughout the app.
 *
 * TODO: Remove this provider when Redux is fully replaced with PortalProvider state
 * This is a temporary bridge to maintain backward compatibility while migrating
 * from Redux to PortalProvider.
 *
 * Architecture:
 *   PortalProvider (provides map state)
 *     ↓
 *   PortalReduxSyncProvider (syncs to Redux) ← THIS COMPONENT
 *     ↓
 *   App Components (no Redux imports needed!)
 */
export const PortalReduxSyncProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const dispatch = useDispatch();
  const { currentMapStyle } = usePortal();

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

  // Sync map style changes to Redux background layer
  useEffect(() => {
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
  }, [
    currentMapStyle,
    selectedMapLayer,
    selectedLuftbildLayer,
    backgroundLayer.visible,
    backgroundLayer.opacity,
    dispatch,
  ]);

  // Future: Add more sync logic here (position, camera, etc.)
  // This keeps all Redux sync in one place

  return <>{children}</>;
};
