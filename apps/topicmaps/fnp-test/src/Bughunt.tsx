// @ts-ignore
import { RoutedMap } from 'react-cismap';
import { Doc } from '../document-viewer';
import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import CismapLayer from 'react-cismap/CismapLayer';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
// @ts-ignore
import Raster from 'leaflet-rastercoords';
// @ts-ignore
import L from 'leaflet';

const Component = () => {
  const leafletMapRef = useRef(null);

  return (
    <RoutedMap
      style={{ height: 1000, width: 1000, backgroundColor: 'white' }}
      backgroundLayers="no"
      //   minZoom={1}
      //   maxZoom={6}
      //   zoomSnap={0.1}
      //   zoomDelta={1}
      _referenceSystem={L.CRS.Simple}
      ref={leafletMapRef}
      //   backgroundlayers={'rvrGrau'}
    >
      {/* <CismapLayer
        {...{
          type: 'tiles',
          //   _url: layer.layerUrl,
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          //   bounds: layer.layerBounds,
          minNativeZoom: 1,
          tms: true,
          noWrap: true,
          maxNativeZoom: 12,
          key: 'tileLayer',
        }}
      /> */}
      <CismapLayer
        {...{
          type: 'wmts',
          url: 'https://geodaten.metropoleruhr.de/spw2/service',
          layers: 'spw2_light_grundriss',
          version: '1.3.0',
          tileSize: 256,
          transparent: true,
        }}
      />
    </RoutedMap>
  );
};
export default Component;
