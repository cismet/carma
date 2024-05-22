import { Cesium3DTileset } from 'resium';
import { logTileSetInfoOnReady } from '../lib/cesiumHelpers';
import GeoJsonSelector from '../components/GeoJsonSelector';
import { setSelectionTransparency, useViewerDataSources } from '../store';
import RangeInput from '../components/controls/RangeInput';

function View() {
  const { footprintGeoJson, tileset } = useViewerDataSources();
  return (
    footprintGeoJson &&
    tileset && (
      <>
        <Cesium3DTileset url={tileset.url} onReady={logTileSetInfoOnReady} />
        <GeoJsonSelector srcExtruded={footprintGeoJson.url} />
        <div
          className="leaflet-bar leaflet-control leaflet-control-layers-expanded"
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '10px',
            zIndex: 1000,
          }}
        >
          <RangeInput
            title="Set the transparency of the buildings:"
            valueSelector={(state) => state.selectionTransparency}
            actionCreator={setSelectionTransparency}
          />
        </div>
      </>
    )
  );
}

export default View;
