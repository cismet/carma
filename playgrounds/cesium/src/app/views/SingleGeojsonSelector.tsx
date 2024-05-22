import { Cesium3DTileset } from 'resium';
import { logTileSetInfoOnReady } from '../lib/cesiumHelpers';
import GeoJsonSelector from '../components/GeoJsonSelector';
import { useViewerDataSources } from '../store';

function View() {
  const { footprintGeoJson, tileset } = useViewerDataSources();
  return (
    <>
      {tileset && (
        <Cesium3DTileset url={tileset.url} onReady={logTileSetInfoOnReady} />
      )}
      {footprintGeoJson && <GeoJsonSelector srcExtruded={footprintGeoJson.url} single={true}/>}
    </>
  );
}

export default View;
