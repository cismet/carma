import TestMarkers from "./views/tests/Markers";

import TestComponentCesiumWidgetMap from "./views/tests/components/CesiumWidgetMap";

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
  ["/", "", TestMarkers],
  ["/poi", "Marker", TestMarkers],
  [
    "/test",
    "⚙️ Test",
    [
      ["/viewer", "ComponentTest Viewer", TestComponentCesiumWidgetMap],
    ],
  ],
];

export const otherRoutes: RouteDescriptor[] = [
  [
    "/testapp",
    "⚙️ Standalone",
    [
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
