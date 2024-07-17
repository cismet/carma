import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useCesium } from 'resium';
import { CesiumTerrainProvider, Color, Viewer } from 'cesium';
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from '../../CustomViewerContextProvider/slices/viewer';
import { SceneStyles } from '../../..';
import {
  CustomViewerContextType,
  useCustomViewerContext,
} from '../../CustomViewerContextProvider/components/CustomViewerContextProvider';

// TODO move combined common setup out of here

const setupPrimaryStyle = (
  viewer: Viewer,
  { terrainProvider, imageryLayer }: CustomViewerContextType
) => {
  (async () => {
    viewer.scene.globe.baseColor = Color.DARKGRAY;

    if (viewer.scene.terrainProvider instanceof CesiumTerrainProvider) {
      //viewer.scene.terrainProvider = ellipsoidTerrainProvider;
    } else {
      const provider = await terrainProvider;
      if (provider) {
        viewer.scene.terrainProvider = provider;
      }
    }
    // viewer.scene.globe.depthTestAgainstTerrain = false;

    if (imageryLayer) {
      imageryLayer.show = false;
      if (!viewer.imageryLayers.contains(imageryLayer)) {
        viewer.imageryLayers.add(imageryLayer);
      }
    }
  })();
};

export const setupSecondaryStyle = (
  viewer: Viewer,
  { terrainProvider, imageryLayer }: CustomViewerContextType
) => {
  if (!viewer) return;
  (async () => {
    viewer.scene.globe.baseColor = Color.WHITE;

    // console.log('setnull) {daryStyle', viewer.scene.terrainProvider);
    if (!(viewer.scene.terrainProvider instanceof CesiumTerrainProvider)) {
      const provider = await terrainProvider;
      if (provider) {
        viewer.scene.terrainProvider = provider;
      }
    }
    // DEPTH TEST is quite slow, only use if really necessary
    // viewer.scene.globe.depthTestAgainstTerrain = true;
    // viewer.scene.globe.show = false;

    if (imageryLayer && imageryLayer.ready) {
      imageryLayer.show = true;
      // console.log('Secondary Style Setup: add imagery layer');
      if (!viewer.imageryLayers.contains(imageryLayer)) {
        // console.log('Secondary Style Setup: add imagery layer');
        viewer.imageryLayers.add(imageryLayer);
      }
    }
    // viewer.scene.globe.show = true;
  })();
};

export const useSceneStyleToggle = (style?: keyof SceneStyles) => {
  const dispatch = useDispatch();
  const { viewer } = useCesium();

  // TODO initial style set by parameter
  const [isPrimaryStyle, setIsPrimaryStyle] = useState(true);
  console.log('HOOK: useSceneStyleToggle', style);
  const customViewerContext = useCustomViewerContext();

  useEffect(() => {
    if (!viewer) return;

    if (isPrimaryStyle) {
      setupPrimaryStyle(viewer, customViewerContext);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else {
      setupSecondaryStyle(viewer, customViewerContext);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    }

    return () => {
      if (isPrimaryStyle) {
        setupSecondaryStyle(viewer, customViewerContext);
        dispatch(setShowSecondaryTileset(true));
        dispatch(setShowPrimaryTileset(false));
      } else {
        setupPrimaryStyle(viewer, customViewerContext);
        dispatch(setShowPrimaryTileset(true));
        dispatch(setShowSecondaryTileset(false));
      }
    };
  }, [dispatch, viewer, isPrimaryStyle]);

  const toggleSceneTyle = () => {
    setIsPrimaryStyle(!isPrimaryStyle);
  };

  return toggleSceneTyle;
};
