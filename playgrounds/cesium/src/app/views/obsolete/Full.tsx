/* eslint-disable jsx-a11y/anchor-has-content */
/* eslint-disable jsx-a11y/anchor-is-valid */

//import "leaflet-fullscreen-custom-container-fork";
//import "leaflet-fullscreen-custom-container-fork/dist/leaflet.fullscreen.css";

import 'leaflet/dist/leaflet.css';
import Viewer from '../../components/CustomViewer';
import { Cesium3DTileset } from 'resium';
import { Cartesian3, Matrix4 } from 'cesium';
import { useLayoutEffect, useRef, useState } from 'react';
import Cross from '../../components/Crosshair';
import ControlContainer from '../../components/controls/ControlContainer';
import OnMapButton from '../../components/controls/OnMapButton';
import { faBars, faCube, faSquare } from '@fortawesome/free-solid-svg-icons';
import HomeControl from '../../components/controls/HomeControl';
import OrbitControl from '../../components/controls/OrbitControl';
import FullScreenMode from '../../components/controls/FullscreenMode';
import LockCenterControl from '../../components/controls/LockCenterControl';
import DebugInfo from '../../components/controls/DebugInfo';
import Experiments from '../../components/controls/Experiments';
import * as Cesium from 'cesium';
import ZoomControls from '../../components/controls/ZoomControls';

const home = Cesium.Cartesian3.fromDegrees(7.20009, 51.272034, 150);

function useWindowSize() {
  const [size, setSize] = useState([0, 0]);
  useLayoutEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight]);
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  return { width: size[0], height: size[1] };
}
function View() {
  const windowSize = useWindowSize();
  const dev = process.env.NODE_ENV !== 'production';

  const [meshVisible, setMeshVisible] = useState(true);
  const tilesetRef = useRef(null);
  const heightOffset = 0;
  const surface = Cartesian3.fromRadians(7.20009, 51.272034, 0.0);
  const offset = Cartesian3.fromRadians(7.20009, 51.272034, heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return (
    <>
      <ControlContainer position="topright">
        <OnMapButton icon={faBars} title="Optionen" />
      </ControlContainer>

      <ControlContainer position="topleft">
        <ZoomControls />
        <HomeControl />
        <OrbitControl />

        {!meshVisible && (
          <OnMapButton
            onClick={() => setMeshVisible(true)}
            title="3D Mesh anzeigen"
            icon={faCube}
          ></OnMapButton>
        )}
        {meshVisible && (
          <OnMapButton
            onClick={() => setMeshVisible(false)}
            title="3D Mesh ausblenden"
            icon={faSquare}
          ></OnMapButton>
        )}
        <FullScreenMode />
        <LockCenterControl />

        {dev && (
          <>
            <DebugInfo />
            <Experiments tilesetRef={tilesetRef.current} />
          </>
        )}
      </ControlContainer>
      {meshVisible && (
        <Cesium3DTileset
          ref={tilesetRef}
          modelMatrix={modelMatrix}
          // debugWireframe={true}
          // showOutline={true}
          // enableShowOutline={true}
          // debugShowRenderingStatistics={true}
          // enableDebugWireframe={true}
          //debugColorizeTiles={true}
          url={'https://wupp-3d-data.cismet.de/mesh/tileset.json'}
          onClick={(movement, target) => {
            console.log('movement,target', { movement, target });
          }}
        />
      )}
      <Cross />
    </>
  );
}

export default View;
