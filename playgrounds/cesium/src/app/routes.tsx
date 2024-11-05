import ClassifyByGeoJson from "./views/ByGeoJsonClassifier";

import TestExtrudeGeoJson from "./views/tests/ExtrudeGeoJson";
import TestMarkers from "./views/tests/Markers";

import TestComponentCustomViewer from "./views/tests/components/CustomViewer";
import TestComponentByGeoJsonClassifier from "./views/tests/components/ByGeoJsonClassifier";

import StandaloneResium from "./views/tests/standalone/Resium";
import StandaloneTopicMap from "./views/tests/standalone/TopicMap";
import StandaloneWidget from "./views/tests/standalone/Widget";
import { HQ500 } from "./views/tests/standalone/HQ500";

import { ComponentType } from "react";

export type RouteItem = [string, string, ComponentType];

export type RoutePath = [string, string, RouteItem[] | RoutePath[]];

export type RouteDescriptor = RouteItem | RoutePath;

// views or features 🚧 under heavy construction
// (obsolete or unmaintained)
// ⚙️ for debug or test views

export const viewerRoutes: RouteDescriptor[] = [
  ["/", "", ClassifyByGeoJson],
  ["/geojson-classify", "Gebäudeauswahl", ClassifyByGeoJson],
  ["/extrude", "Extrusion", TestExtrudeGeoJson],
  ["/poi", "Marker", TestMarkers],
  [
    "/test",
    "⚙️ Test",
    [
      [
        "/geojson",
        "ComponentTest GeoJSON Overlay",
        TestComponentByGeoJsonClassifier,
      ],
      ["/viewer", "ComponentTest Viewer", TestComponentCustomViewer],
    ],
  ],
];

export const otherRoutes: RouteDescriptor[] = [
  [
    "/testapp",
    "⚙️ Standalone",
    [
      ["/resium", "Standalone Test Resium", StandaloneResium],
      [
        "/topicMapWithBaseLayer",
        "Standalone Test TopicMapWithBaseLayer",
        StandaloneTopicMap,
      ],
      ["/widget", "Standalone Test Widget", StandaloneWidget],
      ["/hq500", "Standalone Hq 500 Demo", HQ500],
    ],
  ],
];

export default viewerRoutes;
