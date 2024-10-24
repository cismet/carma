import { createContext, MutableRefObject } from "react";

import {
    CesiumTerrainProvider,
    EllipsoidTerrainProvider,
    ImageryLayer,
    Viewer,
    Cesium3DTileset,
} from "cesium";

export interface CesiumContextType {
    viewerRef: MutableRefObject<Viewer | null>;
    terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
    surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
    imageryLayerRef: MutableRefObject<ImageryLayer | null>;
    ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>;
    tilesetsRefs: {
        primaryRef: MutableRefObject<Cesium3DTileset | null>;
        secondaryRef: MutableRefObject<Cesium3DTileset | null>;
    }
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
