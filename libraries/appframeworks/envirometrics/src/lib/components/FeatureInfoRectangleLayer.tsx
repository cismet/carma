import { FeatureCollectionDisplay } from "react-cismap";

const DEFAULT_PIXEL_SIZE = 1.613669350976827;

export interface FeatureInfoRectangleLayerProps {
  /** Click position in EPSG:3857 (x, y). */
  position: [number, number] | undefined;
  /** Raster origin X in EPSG:3857 (gdalinfo upper-left). */
  upperleftX: number;
  /** Raster origin Y in EPSG:3857 (gdalinfo upper-left). */
  upperleftY: number;
  /** Raster pixel size in meters. */
  pixelsize?: number;
  /** Optional value attached to the displayed feature, useful for tooltips. */
  value?: unknown;
  /** Override the polygon style. */
  style?: () => Record<string, unknown>;
}

const defaultStyle = () => ({
  color: "black",
  fillColor: "black",
  weight: "0.75",
  opacity: 1,
  fillOpacity: 0.3,
});

export const FeatureInfoRectangleLayer = ({
  position,
  upperleftX,
  upperleftY,
  pixelsize = DEFAULT_PIXEL_SIZE,
  value,
  style = defaultStyle,
}: FeatureInfoRectangleLayerProps) => {
  if (!position) {
    return null;
  }

  const size = pixelsize;
  const half = size / 2;

  const [clickX, clickY] = position;

  const xCorrection = (clickX - upperleftX) % size;
  const yCorrection = (clickY - upperleftY) % size;

  const x = clickX - xCorrection + half;
  const y = clickY - yCorrection - half;

  const geoJsonObject = {
    id: 0,
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x - half, y - half],
          [x + half, y - half],
          [x + half, y + half],
          [x - half, y + half],
          [x - half, y - half],
        ],
      ],
    },
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::3857",
      },
    },
    properties: {
      value,
    },
  };

  return (
    <FeatureCollectionDisplay
      featureCollection={[geoJsonObject]}
      clusteringEnabled={false}
      style={style}
      featureStylerScalableImageSize={30}
      showMarkerCollection={true}
    />
  );
};

export default FeatureInfoRectangleLayer;
