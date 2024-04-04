// @ts-ignore
import { RoutedMap } from 'react-cismap';
import { Doc } from '../document-viewer';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import CismapLayer from 'react-cismap/CismapLayer';
// @ts-ignore
import Raster from 'leaflet-rastercoords';
// @ts-ignore
import L from 'leaflet';

L.RasterCoords = Raster;

interface DocMapsProps {
  docs?: Doc[];
  index: number;
}

const DocMap = ({ docs, index }: DocMapsProps) => {
  const [layer, setLayer] = useState<
    | {
        layerUrl: string;
        layerBounds: { lat: number; lng: number }[][] | undefined;
      }
    | undefined
  >();
  const leafletMapRef = useRef(null);

  const getLayer = async () => {
    if (docs) {
      try {
        const meta = await fetch(docs[index - 1].meta)
          .then((response) => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.json();
          })
          .then((result) => {
            return result;
          });
        let layerUrl = docs[index - 1].layer;

        if (meta) {
          // if (meta.pages > 1) {
          //   layerUrl = layerUrl.replace('.pdf/', `.pdf-${index}/`);
          // }

          const dimensions = [
            meta['layer' + `${index - 1}`].x,
            meta['layer' + `${index - 1}`].y,
          ];

          // const meta = {};

          let layerBounds;

          if (leafletMapRef.current) {
            const rc = new L.RasterCoords(
              leafletMapRef.current.leafletMap.leafletElement,
              dimensions
            );
            layerBounds = [
              [
                rc.unproject([0, 0]),
                rc.unproject([dimensions[0], dimensions[1]]),
              ],
            ];
          }
          const layer = {
            layerUrl,
            meta,
            layerBounds,
            maxZoom: meta.maxZoom | 6,
          };

          setLayer(layer);
        } else {
          setLayer(undefined);
        }
      } catch (e) {
        console.log(e);
        setLayer(undefined);
      }
    }
  };

  useEffect(() => {
    if (docs && index) {
      getLayer();
    }
  }, [index, docs]);

  return (
    <RoutedMap
      style={{ height: 1000, width: 1000, backgroundColor: 'white' }}
      backgroundLayers="no"
      minZoom={1}
      maxZoom={6}
      zoomSnap={0.1}
      zoomDelta={1}
      referenceSystem={L.CRS.Simple}
      ref={leafletMapRef}
    >
      {layer?.layerUrl && (
        <CismapLayer
          {...{
            type: 'tiles',
            url: layer.layerUrl,
            bounds: layer.layerBounds,
            minNativeZoom: 1,
            tms: true,
            noWrap: true,
            maxNativeZoom: 12,
            key: 'tileLayer',
          }}
        />
      )}
    </RoutedMap>
  );
};

export default DocMap;
