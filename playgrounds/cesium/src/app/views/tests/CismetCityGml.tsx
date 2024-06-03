import { Cesium3DTileset } from 'resium';
import { getTileSetInfo } from '../../utils/cesiumHelpers';
import { useTilesetControl } from '../../utils/controls';
import { ImageryLayer, Viewer as ResiumViewer } from 'resium';
import Crosshair from '../../components/UI/Crosshair';

import { BaseTileset } from '../../components/CustomViewer/components/BaseTileset';
import ControlsUI from '../../components/CustomViewer/components/ControlsUI';
import { useCallback, useEffect, useState } from 'react';
import {
  useGlobeBaseColor,
  useShowTileset,
  useViewerHome,
  useViewerHomeOffset,
} from '../../store/slices/viewer';
import {
  BoundingSphere,
  CesiumTerrainProvider,
  Color,
  WebMapServiceImageryProvider,
} from 'cesium';
function View() {
  const home = useViewerHome();
  const homeOffset = useViewerHomeOffset();
  const globeBaseColor = useGlobeBaseColor();
  const showTileset = useShowTileset();

  const {
    children = undefined,
    className = '',
    showCrosshair = true,
    showControls = true,
    showHome = true,
    showOrbit = true,
    showDebug = true,

    infoBox = false,
    selectionIndicator = false,

    globeColor = globeBaseColor,
  } = {};

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const viewerRef = useCallback((node) => {
    if (node !== null) {
      setViewer(node.cesiumElement);
    }
  }, []);

  useEffect(() => {
    if (viewer && home && homeOffset) {
      console.log('Setting home position', home, homeOffset);
      // Set the initial position of the camera a bit further away, to not show the globe at start
      viewer.camera.lookAt(home, homeOffset);
      viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
        duration: 2,
      });
    }
  }, [viewer, home, homeOffset]);

  useEffect(() => {
    if (!viewer) return;
    // remove default imagery
    // viewer.imageryLayers.removeAll();
    // set the globe color
    viewer.scene.globe.baseColor = Color.BLACK;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    const moveEndListener = () => {
      console.log('moveEndListener');
    };

    //give me a local async blcok that gets excuted diretlx that prints out a mesage for now

    (async () => {
      var terrainProvider = await CesiumTerrainProvider.fromUrl(
        'https://cesium-wupp-terrain.cismet.de/terrain2020'
      );
      console.log('terrainProvider', terrainProvider);
      viewer.scene.terrainProvider = terrainProvider;
      viewer.scene.globe.depthTestAgainstTerrain = true;
    })();

    viewer.camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
    };
  }, [viewer]);

  let style;
  const provider = new WebMapServiceImageryProvider({
    //url: 'https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
    // layers: 'de_basemapde_web_raster_grau',
    //layers: 'de_basemapde_web_raster_farbe',

    url: 'https://geodaten.metropoleruhr.de/spw2/service',
    layers: 'spw2_light_grundriss',
    // layers: 'spw2_graublau',
    //layers: 'spw2_extralight',

    parameters: {
      transparent: true,
      format: 'image/png',
    },
  });
  useTilesetControl();
  return (
    <ResiumViewer
      ref={viewerRef}
      className={className}
      // Resium ViewerOtherProps
      full // equals style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}`
      // Cesium Props
      // see https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html#.ConstructorOptions for defaults

      // quality and performance
      msaaSamples={2}
      useBrowserRecommendedResolution={false} // crisper image, does not ignore devicepixel ratio
      // resolutionScale={window.devicePixelRatio} // would override dpr
      scene3DOnly={true} // No 2D map resources loaded
      // sceneMode={SceneMode.SCENE3D} // Default but explicit

      // hide UI      animation={false}
      animation={false}
      baseLayerPicker={false}
      fullscreenButton={false}
      geocoder={false}
      homeButton={false}
      infoBox={false}
      sceneModePicker={false}
      selectionIndicator={selectionIndicator}
      timeline={false}
      navigationHelpButton={false}
      navigationInstructionsInitiallyVisible={false}
    >
      {/* {showTileset && <BaseTileset />} */}
      {children}
      {showControls && (
        <ControlsUI
          showDebug={showDebug}
          showHome={showHome}
          showOrbit={showOrbit}
        />
      )}
      {showCrosshair && <Crosshair lineColor="white" />}
      <ImageryLayer imageryProvider={provider} />
      <Cesium3DTileset
        url={'https://wupp-3d-data.cismet.de/lod2/tileset.json'}
        onReady={getTileSetInfo}
      />
    </ResiumViewer>
  );
}
export default View;
