import MinimalMesh from "./views/MinimalMesh";
import MinimalLod2 from "./views/MinimalLod2";
import ShadowMesh from "./views/ShadowMesh";

import { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "@carma-mapping/cesium-engine";

export const views = [
  { path: "/minimal-mesh", name: "Minimal Mesh", component: MinimalMesh },
  { path: "/minimal-lod2", name: "Minimal LOD2", component: MinimalLod2 },
  {
    path: "/shadow-mesh",
    name: "Shadow Simulation (Mesh)",
    component: ShadowMesh,
  },
];

export const cesiumConstructorOptions = {
  ...DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  creditContainer: document.createElement("div"),
};
