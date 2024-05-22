import 'leaflet/dist/leaflet.css';
import { Cesium3DTileset } from 'resium';
import { Cartesian3, Matrix4 } from 'cesium';
import { useRef, useState } from 'react';
import Viewer from '../../components/CustomViewer';

function View() {
  const [meshVisible] = useState(true);
  const tilesetRef = useRef(null);
  const heightOffset = 0;
  const surface = Cartesian3.fromRadians(7.20009, 51.272034, 0.0);
  const offset = Cartesian3.fromRadians(7.20009, 51.272034, heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return (
    meshVisible && (
      <Cesium3DTileset
        ref={tilesetRef}
        modelMatrix={modelMatrix}
        // debugWireframe={true}
        // showOutline={true}
        // enableShowOutline={true}
        // debugShowRenderingStatistics={true}
        // enableDebugWireframe={true}
        //debugColorizeTiles={true}
        // scene3DOnly={true}
        url={'https://wupp-3d-data.cismet.de/mesh/tileset.json'}
        onClick={(movement, target) => {
          console.log('movement,target', { movement, target });
        }}
      />
    )
  );
}

export default View;
