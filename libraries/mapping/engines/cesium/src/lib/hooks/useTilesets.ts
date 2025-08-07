import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../CustomViewer";

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const showSecondary = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d);
  
  const {
    viewerRef,
    primaryTilesetsRef,
    secondaryTilesetsRef,
    selectedPrimaryTilesetIndex,
    selectedSecondaryTilesetIndex,
    tilesetsLoadedCounter,
  } = useCesiumContext();

  // Add tilesets to viewer when they're loaded
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    
    const viewer = viewerRef.current;
    
    // Add primary tilesets
    primaryTilesetsRef.current.forEach((tileset) => {
      if (tileset && !viewer.scene.primitives.contains(tileset)) {
        viewer.scene.primitives.add(tileset);
        console.debug("[CESIUM|DEBUG] Adding primary tileset to viewer");
      }
    });
    
    // Add secondary tilesets
    secondaryTilesetsRef.current.forEach((tileset) => {
      if (tileset && !viewer.scene.primitives.contains(tileset)) {
        viewer.scene.primitives.add(tileset);
        console.debug("[CESIUM|DEBUG] Adding secondary tileset to viewer");
      }
    });
  }, [tilesetsLoadedCounter, viewerRef]);

  // Handle primary tileset visibility - show selected, hide others
  useEffect(() => {
    console.debug("HOOK: Primary tileset selection changed", selectedPrimaryTilesetIndex, showPrimary);
    
    primaryTilesetsRef.current.forEach((tileset, index) => {
      if (tileset) {
        tileset.show = showPrimary && index === (selectedPrimaryTilesetIndex ?? 0);
      }
    });
  }, [selectedPrimaryTilesetIndex, showPrimary]);

  // Handle secondary tileset visibility - show selected, hide others
  useEffect(() => {
    console.debug("HOOK: Secondary tileset selection changed", selectedSecondaryTilesetIndex, showSecondary);
    
    secondaryTilesetsRef.current.forEach((tileset, index) => {
      if (tileset) {
        tileset.show = showSecondary && index === (selectedSecondaryTilesetIndex ?? 0);
      }
    });
  }, [selectedSecondaryTilesetIndex, showSecondary]);

  // Handle 2D mode - hide all tilesets
  useEffect(() => {
    const hideTilesets = () => {
      console.debug("HOOK: hide tilesets in 2d");
      primaryTilesetsRef.current.forEach((tileset) => {
        if (tileset) tileset.show = false;
      });
      secondaryTilesetsRef.current.forEach((tileset) => {
        if (tileset) tileset.show = false;
      });
    };

    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      if (isMode2d) {
        setTimeout(() => {
          hideTilesets();
        }, TRANSITION_DELAY);
      } else {
        // Restore visibility based on current selection
        primaryTilesetsRef.current.forEach((tileset, index) => {
          if (tileset) {
            tileset.show = showPrimary && index === (selectedPrimaryTilesetIndex ?? 0);
          }
        });
        secondaryTilesetsRef.current.forEach((tileset, index) => {
          if (tileset) {
            tileset.show = showSecondary && index === (selectedSecondaryTilesetIndex ?? 0);
          }
        });
      }
    } else {
      console.debug("HOOK: no viewer");
      hideTilesets();
    }
  }, [isMode2d, viewerRef, showPrimary, showSecondary, selectedPrimaryTilesetIndex, selectedSecondaryTilesetIndex, primaryTilesetsRef, secondaryTilesetsRef]);

  useSecondaryStyleTilesetClickHandler();
};
