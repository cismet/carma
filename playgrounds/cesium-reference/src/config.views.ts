import { lazy } from "react";

const MinimalMesh = lazy(() => import("./views/MinimalMesh"));
const MinimalLod2 = lazy(() => import("./views/MinimalLod2"));
const ShadowMesh = lazy(() => import("./views/ShadowMesh"));
const ViewShed = lazy(() => import("./views/ViewShed"));
const ObliqueAndMesh = lazy(() => import("./views/ObliqueAndMesh"));
const NavigationControlView = lazy(() => import("./views/NavigationControl"));
const TestMesh = lazy(() => import("./views/TestMesh"));
const Measurements = lazy(() => import("./views/Measurements"));
const ModelPlacement = lazy(() => import("./views/ModelPlacement"));

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
  {
    path: "/model-placement",
    name: "Model Placement",
    component: ModelPlacement,
  },
];
