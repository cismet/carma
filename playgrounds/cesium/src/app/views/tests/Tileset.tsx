import { Color } from 'cesium';
import { Cesium3DTileset, Entity } from 'resium';

import { useViewerDataSources, useViewerHome } from '../../store';

function TestTileset() {
  const { footprintGeoJson, tileset } = useViewerDataSources();
  const home = useViewerHome();
  return (
    footprintGeoJson &&
    tileset && home && (
      <>
        <Cesium3DTileset url={tileset.url} />
        <Entity
          position={home}
          point={{ pixelSize: 15, color: Color.YELLOW }}
        />
      </>
    )
  );
}

export default TestTileset;
