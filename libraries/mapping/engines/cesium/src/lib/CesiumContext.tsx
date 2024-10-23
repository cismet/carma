import { createContext } from "react";

import {
    CesiumTerrainProvider,
    EllipsoidTerrainProvider,
    ImageryLayer,
    Viewer,
    Cesium3DTileset,
} from "cesium";

export interface CesiumContextType {
    viewer: Viewer | null;
    setViewer: (viewer: Viewer | null) => void;
    terrainProvider: CesiumTerrainProvider | null;
    surfaceProvider: CesiumTerrainProvider | null;
    //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
    imageryLayer: ImageryLayer | null;
    ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
    tilesets: {
        primary: Cesium3DTileset | null;
        secondary: Cesium3DTileset | null;
    };
    // TODO add more setters
    setPrimaryTileset: (tileset: Cesium3DTileset | null) => void;
    setSecondaryTileset: (tileset: Cesium3DTileset | null) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
