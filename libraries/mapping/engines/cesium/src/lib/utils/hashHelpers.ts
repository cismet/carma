import { Cartesian3, Cartographic, Viewer, Math as CesiumMath } from "cesium";
import {
  AppState,
  EncodedSceneParams,
  FlatDecodedSceneHash,
  SceneStateDescription,
} from "../..";

// 5 DEGREES OF FREEDOM CAMERA encoding/decoding
// lon, lat, height, heading, pitch
// does not always map to a point on the ground so there is no way to encode only the position on the ground at center
// the camera height is the ellipsoidal height of the camera position, so it works well even if the terrain is not loaded

// Zoom is not encoded in the camera position, but can be passed as a separate parameter, only used as reference for leaflet/slippy map zoom level

// TODO implement zoom level to camera height conversion with terrain height for reverse use case.

const DEGREE_DIGITS = 7;
const CAMERA_DEGREE_DIGITS = 2;
const FRACTIONAL_ZOOM_DIGITS = 3;
const MINZOOM = 6;
const MAXZOOM = 20;

const formatRadians = (value: number, fixed = DEGREE_DIGITS) =>
  parseFloat(CesiumMath.toDegrees(value).toFixed(fixed)); // parse float removes trailing zeros for shorter urls

export const hashcodecs = {
  // parsefloat removes trailing zeros for shorter urls
  longitude: {
    key: "lng",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  latitude: {
    key: "lat",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  height: {
    key: "h",
    decode: (value: string) => Number(value),
    encode: (value: number) => parseFloat(value.toFixed(2)),
  },
  heading: {
    key: "heading",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS) % 360,
  },
  pitch: {
    key: "pitch",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS) % 360,
  },
  zoom: {
    key: "zoom",
    decode: (value: string) => undefined,
    encode: (value: number) =>
      parseFloat(
        Math.min(Math.max(MINZOOM, value), MAXZOOM).toFixed(
          FRACTIONAL_ZOOM_DIGITS
        )
      ),
  },
  isAnimating: {
    key: "anim",
    decode: (value: string) => value === "true" || value === "1",
    encode: (value: boolean) => (value ? "1" : null),
  },
  isSecondaryStyle: {
    key: "m",
    decode: (value: string) => value === "true" || value === "1",
    encode: (value: boolean) => (value ? "1" : null),
  },
  isMode2d: {
    // isMode2d is the inverse of is3d
    key: "is3d",
    decode: (value: string) => !(value === "true" || value === "1"),
    encode: (value: boolean) => (!value ? "1" : null),
  },
};

export function encodeScene(
  viewer: Viewer,
  appState: AppState = {}
): EncodedSceneParams {
  const { camera } = viewer;
  const { x, y, z } = camera.position;

  const { longitude, latitude, height } = Cartographic.fromCartesian(
    new Cartesian3(x, y, z)
  );

  const heading = camera.heading;
  const pitch = camera.pitch;

  const { isAnimating, isSecondaryStyle, zoom, isMode2d } = appState;
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
    isMode2d,
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
  //console.debug('hashparams', hashparams);
  //const hash = new URLSearchParams(hashParams).toString();
  return {
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
    longitude: decoded["longitude"] as number,
    latitude: decoded["latitude"] as number,
    height: decoded["height"] as number,
    heading: decoded["heading"] as number,
    pitch: decoded["pitch"] as number,
  };
  return {
    camera,
    ...decoded,
  };
}

export const replaceHashRoutedHistory = (
  encodedScene: EncodedSceneParams,
  routedPath: string
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  if (encodedScene.hashParams) {
    const currentHash = window.location.hash.split("?")[1] || "";
    const currentParams = Object.fromEntries(new URLSearchParams(currentHash));

    const combinedParams = {
      ...currentParams,
      ...encodedScene.hashParams, // overwrite from state but keep others
    };

    const combinedSearchParams = new URLSearchParams(combinedParams);
    const combinedHash = combinedSearchParams.toString();
    const formattedHash = combinedHash.replace(/=&/g, "&").replace(/=$/, ""); // remove empty values
    const fullHashState = `#${routedPath}?${formattedHash}`;
    // this is a workaround to avoid triggering rerenders from the HashRouter
    // navigate would cause rerenders
    // navigate(`${routedPath}?${formattedHash}`, { replace: true });
    // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

    const currentUrl = new URL(window.location.href);
    const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

    window.history.replaceState(null, "", newUrl);
  }
};
