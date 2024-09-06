# carma-map-engines-cesium

This library was generated with [Nx](https://nx.dev).

TODO:

add basic installation/app integration instructions

- how to setup stores
- adjust build process to provide cesium assets and workers to app

from old playground vite.config.mts:

How to fix Cesium related issues as of 2024-05-17, cesium@1.117

0. make sure vite.config.mts is marked as module type script with .mts not .ts

1. Import the styles in your app

import "cesium/Build/Cesium/Widgets/widgets.css";

2. Copy the assets to the dist folder 
see vitestaticcopy plugin

3. Adjust CESIUM_BASE_URL in window
window.CESIUM_BASE_URL = CESIUM_BASE_URL;

add GLOBAL type for window.CESIUM_BASE_URL

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}


Resources:
https://community.cesium.com/t/is-there-a-good-way-to-use-cesium-with-vite/27545
https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/#step-2-set-up-the-cesiumjs-client
https://github.com/s3xysteak/vite-plugin-cesium-build/

## Building

Run `nx build carma-map-engines-cesium` to build the library.

## Running unit tests

Run `nx test carma-map-engines-cesium` to execute the unit tests via [Vitest](https://vitest.dev/).
