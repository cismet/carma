import { Cartesian3, Cartographic, Viewer, Math as CeMath } from 'cesium';
import { cesiumCenterPixelSizeToLeafletZoom } from '../../utils/cesiumHelpers';
import L from 'leaflet';

// 5 DEGREES OF FREEDOM CAMERA encoding/decoding
// lon, lat, height, heading, pitch
// does not always map to a point on the ground so there is no way to encode only the position on the ground at center
// to allow for syncing with leaflet with a non-orthographic projection we need to also encode the zoom level as a separate parameter
// zoom is determined as a vertical distance from the terrain or tileset in meters
// the camera height is the ellipsoidal height of the camera position, so it works well even if the terrain is not loaded
// the zoom level is only written out for out-linking with leaflet, it is not used for cesium directly

// TODO implement zoom level to camera height conversion with terrain height for reverse use case.

const DEGREE_DIGITS = 7;
const CAMERA_DEGREE_DIGITS = 2;
const FRACTIONAL_ZOOM_DIGITS = 3;
const MINZOOM = 6;
const MAXZOOM = 20;

const formatRadians = (value: number, fixed = DEGREE_DIGITS) =>
  parseFloat(CeMath.toDegrees(value).toFixed(fixed)); // parse float removes trailing zeros for shorter urls

const hashcodecs = {
  // parsefloat removes trailing zeros for shorter urls
  longitude: {
    key: 'lng',
    decode: (value: string) => CeMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  latitude: {
    key: 'lat',
    decode: (value: string) => CeMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  height: {
    key: 'h',
    decode: (value: string) => Number(value),
    encode: (value: number) => parseFloat(value.toFixed(2)),
  },
  heading: {
    key: 'heading',
    decode: (value: string) => CeMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS) % 360,
  },
  pitch: {
    key: 'pitch',
    decode: (value: string) => CeMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS) % 360,
  },
  zoom: {
    key: 'zoom',
    decode: (value: string) => undefined,
    encode: (value: number) =>
      parseFloat(
        Math.min(Math.max(MINZOOM, value), MAXZOOM).toFixed(
          FRACTIONAL_ZOOM_DIGITS
        )
      ),
  },
  isAnimating: {
    key: 'anim',
    decode: (value: string) => value === 'true' || value === '1',
    encode: (value: boolean) => (value ? '1' : null),
  },
  isSecondaryStyle: {
    key: 'm',
    decode: (value: string) => value === 'true' || value === '1',
    encode: (value: boolean) => (value ? '1' : null),
  },
};

type HashKey = keyof typeof hashcodecs;

type CodecKeys = {
  [K in HashKey]: (typeof hashcodecs)[K]['key'];
};

type FlatDecodedSceneHash = {
  [K in CodecKeys[keyof CodecKeys]]?: ReturnType<
    (typeof hashcodecs)[HashKey]['decode']
  >;
};

export type SceneStateDescription = {
  camera: {
    longitude?: number | null;
    latitude?: number | null;
    height?: number | null;
    heading?: number | null;
    pitch?: number | null;
  };
  zoom?: number | null;
  isAnimating?: boolean | null;
  isSecondaryStyle?: boolean | null;
};

type AppState = {
  isAnimating?: boolean;
  isSecondaryStyle?: boolean;
  zoom?: number;
};

export function encodeScene(
  viewer: Viewer,
  appState: AppState = {}
): {
  hash: string;
  hashParams: FlatDecodedSceneHash;
  state: SceneStateDescription;
} {
  const { camera } = viewer;
  const { x, y, z } = camera.position;

  const { longitude, latitude, height } = Cartographic.fromCartesian(
    new Cartesian3(x, y, z)
  );

  const heading = camera.heading;
  const pitch = camera.pitch;

  const isAnimating = appState.isAnimating;
  const isSecondaryStyle = appState.isSecondaryStyle;
  const zoom = appState.zoom;
  // set param order here
  const hashParams = [
    longitude,
    latitude,
    height,
    heading,
    pitch,
    zoom,
    isAnimating,
    isSecondaryStyle,
  ].reduce((acc, value, index) => {
    const codec = hashcodecs[Object.keys(hashcodecs)[index]];
    if (value !== undefined && value !== null) {
      const encoded = codec.encode(value);
      if (encoded !== null) {
        acc[codec.key] = encoded;
      }
    }
    return acc;
  }, {});
  //console.log('hashparams', hashparams);
  const hash = new URLSearchParams(hashParams).toString();
  return {
    hash,
    hashParams,
    state: {
      camera: {
        longitude,
        latitude,
        height,
        heading,
        pitch,
      },
      zoom,
      isAnimating,
      isSecondaryStyle,
    },
  };
}

export function decodeSceneFromLocation(
  location: string
): SceneStateDescription {
  const params = new URLSearchParams(location);
  const decoded = Object.keys(hashcodecs).reduce((acc, key) => {
    const codec = hashcodecs[key];
    const value = params.get(codec.key);
    acc[key] =
      value !== null && value !== undefined ? codec.decode(value) : null;
    return acc;
  }, {} as FlatDecodedSceneHash);
  const camera = {
    longitude: decoded.longitude as number,
    latitude: decoded.latitude as number,
    height: decoded.height as number,
    heading: decoded.heading as number,
    pitch: decoded.pitch as number,
  };
  return {
    camera,
    ...decoded,
  };
}

export const replaceHashRoutedHistory = (
  encodedScene: { hash: string; state: SceneStateDescription },
  routedPath: string
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  console.log('replaceHashRoutedHistory sceneHash');
  if (encodedScene.hash) {
    const fullHashState = `#${routedPath}?${encodedScene.hash}`;
    // console.log('updateSceneHash newState', state);
    // this is a workaround to avoid triggering rerenders from the HashRouter
    // navigate would cause rerenders
    // navigate(`${hashRouterPart}?${sceneHash}`, { replace: true });
    // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061
    window.history.replaceState(null, '', fullHashState);
  }
};

export const setLeafletView = async (
  viewer: Viewer,
  leafletElement,
  {
    duration = 0,
    animate = false,
    zoomSnap = 1,
  }: { duration?: number; animate?: boolean; zoomSnap?: number } = {}
) => {
  if (!viewer || !leafletElement) return;
  let zoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;
  if (zoom === null) {
    console.warn('zoom is null, skipping');
    return;
  }
  const MAX_2D_ZOOM = 25;
  const MIN_2D_ZOOM = 9;
  if (zoom > MAX_2D_ZOOM) {
    console.warn('zoom is above max 2d zoom, clamping', MAX_2D_ZOOM, zoom);
    zoom = MAX_2D_ZOOM;
  } else if (zoom < MIN_2D_ZOOM) {
    console.warn('zoom is below min 2d zoom, clamping', MIN_2D_ZOOM, zoom);
    zoom = MIN_2D_ZOOM;
  }

  // TODO add simple method to get lat, lng from cesium camera in degrees
  const { hashParams } = encodeScene(viewer);
  const { lat, lng } = hashParams;
  L.setOptions(leafletElement, { zoomSnap }); // TODO fix zoom snapping in TopicMap Component
  leafletElement.setView([lat, lng], zoom, { duration, animate });
};
