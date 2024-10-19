import { createContext } from "react";

import {
    CesiumTerrainProvider,
    EllipsoidTerrainProvider,
    ImageryLayer,

    Viewer,
    Cesium3DTileset,
    type CustomShader,
} from "cesium";

import { CustomShaderDefinition } from "types/cesium-config";

export interface CesiumContextType {
    viewer: Viewer | null;
    setViewer: (viewer: Viewer | null) => void;
    terrainProvider: CesiumTerrainProvider | null;
    surfaceProvider: CesiumTerrainProvider | null;
    //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
    imageryLayer: ImageryLayer | null;
    ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
    tilesetPrimary: Cesium3DTileset | null;
    tilesetPrimaryShader: CustomShader | null;
    tilesetSecondary: Cesium3DTileset | null;
    tilesetSecondaryShader: CustomShader | null;
    tilesets: [string, Cesium3DTileset][];
    setTilesetPrimary: (tileset: Cesium3DTileset | null) => void;
    setTilesetSecondary: (tileset: Cesium3DTileset | null) => void;
    setTilesetPrimaryShader: (shader: CustomShader | null) => void;
    setTilesetSecondaryShader: (shader: CustomShader | null) => void;
    shaderDefinitions: Record<string, CustomShaderDefinition>;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);

export default CesiumContext;