import MinimalMesh from "./views/MinimalMesh";
import MinimalLod2 from "./views/MinimalLod2";
import ShadowMesh from "./views/ShadowMesh";
import ViewShed from "./views/ViewShed";
import ObliqueAndMesh from "./views/ObliqueAndMesh";
import NavigationControlView from "./views/NavigationControl";
import TestMesh from "./views/TestMesh";
import Measurements from "./views/Measurements";

export const views = [
  { path: "/minimal-mesh", name: "Minimal Mesh", component: MinimalMesh },
  { path: "/minimal-lod2", name: "Minimal LOD2", component: MinimalLod2 },
  {
    path: "/shadow-mesh",
    name: "Shadow Simulation (Mesh)",
    component: ShadowMesh,
  },
  { path: "/view-shed", name: "View Shed", component: ViewShed },
  { path: "/oblique", name: "Oblique and Mesh", component: ObliqueAndMesh },
  {
    path: "/navigation-control",
    name: "Navigation Control",
    component: NavigationControlView,
  },
  { path: "/test-mesh", name: "Test Mesh", component: TestMesh },
  { path: "/measurements", name: "Measurements", component: Measurements },
];
