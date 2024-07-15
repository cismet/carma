// @ts-ignore
import { RoutedMap, TransitiveReactLeaflet } from 'react-cismap';
import { Doc, layer } from '../document-viewer';
import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import CismapLayer from 'react-cismap/CismapLayer';
// @ts-ignore
import Raster from 'leaflet-rastercoords';
// @ts-ignore
import L from 'leaflet';
import { useParams, useSearchParams } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

const { Rectangle } = TransitiveReactLeaflet;

// @ts-ignore
L.RasterCoords = Raster;

interface DocMapsProps {
  docs: Doc[];
  index: number;
  height: number;
  width: number;
  setWholeWidth: any;
  setWholeHeight: any;
}

const DocMap = ({
  docs,
  index,
  height,
  width,
  setWholeWidth,
  setWholeHeight,
}: DocMapsProps) => {
  const [layer, setLayer] = useState<
    | {
        layerUrl: string;
        layerBounds: { lat: number; lng: number }[][];
        meta: {
          contentLength: string;
          pages: number;
          object: layer;
        };
        maxZoom: number;
        fallbackZoom: number;
        fallbackPosition: { lat: number; lng: number };
        bounds: any;
      }
    | undefined
  >();
  const { page } = useParams();
  const leafletMapRef = useRef<any>(null);
  const [urlParams, setUrlParams] = useSearchParams();

  const WIDTH = 'WIDTH';
  const HEIGHT = 'HEIGHT';

  const getPureArrayBounds4LatLngBounds = (llBounds: any) => {
    return [
      [llBounds[0][0].lat, llBounds[0][0].lng],
      [llBounds[0][1].lat, llBounds[0][1].lng],
    ];
  };

  const getLayer = async () => {
    try {
      const meta = docs[index - 1].meta;

      let layerUrl = docs[index - 1].layer;

      if (meta) {
        // @ts-ignore
        if (meta.pages > 1) {
          layerUrl = layerUrl.replace('.pdf/', `.pdf-${parseInt(page!) - 1}/`);
        }

        const pageNumber = parseInt(page!);

        const dimensions = [
          meta['layer' + `${pageNumber - 1}`].x,
          meta['layer' + `${pageNumber - 1}`].y,
        ];

        const maxZoom = meta['layer' + `${pageNumber - 1}`].maxZoom;

        const zoomLevel = Math.ceil(
          Math.log(Math.max(dimensions[0], dimensions[1]) / 256) / Math.log(2)
        );
        // const meta = {};

        let layerBounds;

        if (leafletMapRef.current) {
          // @ts-ignore
          const rc = new L.RasterCoords(
            leafletMapRef.current.leafletMap.leafletElement,
            dimensions
          );
          layerBounds = [
            [
              rc.unproject([0, 0], zoomLevel),
              rc.unproject([dimensions[0], dimensions[1]], zoomLevel),
            ],
          ];
        }

        const bounds = getPureArrayBounds4LatLngBounds(layerBounds);
        const fallbackPosition = {
          lat: (layerBounds![0][0].lat + layerBounds![0][1].lat) / 2,
          lng: (layerBounds![0][0].lng + layerBounds![0][1].lng) / 2,
        };

        const fallbackZoom =
          leafletMapRef.current.leafletMap.leafletElement.getBoundsZoom(bounds);

        const layer = {
          layerUrl,
          meta,
          layerBounds,
          maxZoom: maxZoom,
          bounds,
          fallbackPosition,
          fallbackZoom,
        };
        // @ts-ignore
        setLayer(layer);
      } else {
        setLayer(undefined);
      }
    } catch (e) {
      console.log(e);
      setLayer(undefined);
    }
  };

  const getOptimalBounds = (forDimension?: string) => {
    const meta = docs[index - 1].meta;
    const pageNumber = parseInt(page!);
    let dimensions;

    try {
      dimensions = [
        meta['layer' + `${pageNumber - 1}`].x,
        meta['layer' + `${pageNumber - 1}`].y,
      ];
    } catch (e) {
      dimensions = [2000, 2000];
    }

    const leafletSize = { x: width, y: height };
    if (forDimension) {
      if (leafletSize.x / leafletSize.y < 1) {
        if (forDimension === WIDTH) {
          let targetDimensions = [dimensions[0], dimensions[1]];
          // @ts-ignore
          const rc = new L.RasterCoords(
            leafletMapRef.current.leafletMap.leafletElement,
            targetDimensions
          );

          return [
            [
              rc.unproject([0, 0]),
              rc.unproject([targetDimensions[0], targetDimensions[1]]),
            ],
          ];
        } else if (forDimension === HEIGHT) {
          let targetDimensions = [
            (dimensions[1] * leafletSize.x) / leafletSize.y,
            dimensions[1],
          ];
          // @ts-ignore
          let rc = new L.RasterCoords(
            leafletMapRef.current.leafletMap.leafletElement,
            targetDimensions
          );
          return [
            [
              rc.unproject([0, 0]),
              rc.unproject([targetDimensions[0], targetDimensions[1]]),
            ],
          ];
        }
      } else {
        if (forDimension === WIDTH) {
          let targetDimensions = [
            dimensions[0],
            (dimensions[0] * leafletSize.y) / leafletSize.x,
          ];
          // @ts-ignore
          let rc = new L.RasterCoords(
            leafletMapRef.current.leafletMap.leafletElement,
            targetDimensions
          );
          return [
            [
              rc.unproject([0, 0]),
              rc.unproject([targetDimensions[0], targetDimensions[1]]),
            ],
          ];
        } else if (forDimension === HEIGHT) {
          let targetDimensions = [dimensions[0], dimensions[1]];
          // @ts-ignore
          let rc = new L.RasterCoords(
            leafletMapRef.current.leafletMap.leafletElement,
            targetDimensions
          );
          return [
            [
              rc.unproject([0, 0]),
              rc.unproject([targetDimensions[0], targetDimensions[1]]),
            ],
          ];
        }
      }
      if (leafletMapRef.current.leafletMap?.leafletElement) {
        // @ts-ignore
        const rc = new L.RasterCoords(
          leafletMapRef.current.leafletMap.leafletElement,
          dimensions
        );
        const layerBounds = [
          [rc.unproject([0, 0]), rc.unproject([dimensions[0], dimensions[1]])],
        ];

        return layerBounds;
      }
    }
  };

  const gotoWholeWidth = () => {
    let wb = getOptimalBounds(WIDTH);

    leafletMapRef.current.leafletMap.leafletElement.fitBounds(wb);
  };

  const gotoWholeDocument = () => {
    let wb = getOptimalBounds();
    //this.props.docsActions.setDebugBounds(wb);
    if (leafletMapRef.current.leafletMap?.leafletElement) {
      leafletMapRef.current.leafletMap.leafletElement.invalidateSize();
      leafletMapRef.current.leafletMap.leafletElement.fitBounds(wb);
    }
  };

  const gotoWholeHeight = () => {
    let hb = getOptimalBounds(HEIGHT);

    leafletMapRef.current.leafletMap.leafletElement.fitBounds(hb);
  };

  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

  useEffect(() => {
    if (docs.length > 0 && index && leafletMapRef.current) {
      getLayer();
    }
  }, [index, docs, page, height, leafletMapRef]);

  useEffect(() => {
    gotoWholeHeight();
  }, [setWholeHeight]);

  useEffect(() => {
    if (setWholeWidth) {
      gotoWholeWidth();
    }
  }, [setWholeWidth]);

  return (
    <RoutedMap
      style={{ height: height, width: '100%', backgroundColor: 'white' }}
      backgroundLayers="no"
      minZoom={1}
      maxZoom={6}
      zoomSnap={0.1}
      zoomDelta={1}
      fallbackPosition={layer?.fallbackPosition}
      fallbackZoom={layer?.fallbackZoom}
      referenceSystem={L.CRS.Simple}
      fullScreenControlEnabled={true}
      ref={leafletMapRef}
      key={'leafletRoutedMap.' + index + layer?.layerUrl + '_' + width}
      locationChangedHandler={(location) => {
        const newParams = { ...paramsToObject(urlParams), ...location };
        setUrlParams(newParams);
      }}
    >
      {layer?.layerUrl && (
        <>
          <Rectangle bounds={layer.bounds} color="#D8D8D8D8" />
          <CismapLayer
            {...{
              type: 'tiles',
              url: layer.layerUrl,
              bounds: layer.layerBounds,
              minNativeZoom: 1,
              tms: true,
              noWrap: true,
              maxNativeZoom: layer.maxZoom || 4,
              key:
                'tileLayer.' +
                JSON.stringify(layer.layerBounds) +
                '.' +
                layer.maxZoom,
            }}
          />
        </>
      )}
      <div className="leaflet-bottom leaflet-right">
        <div className="leaflet-control">
          <p
            style={{
              backgroundColor: '#D8D8D8D8',
              padding: '5px',
            }}
          >
            {docs[index - 1].file}
          </p>
        </div>
      </div>
    </RoutedMap>
  );
};

export default DocMap;
