import type { Preview } from "@storybook/react";
import { createElement } from "react";

import "../src/styles.css";
import "../../pointcloud-stories/src/styles.css";
import "../../../libraries/mapping/annotations/runtime/src/lib/interaction/annotation-overlay-line-label.css";

const preview: Preview = {
  decorators: [
    (Story, context) =>
      context.title === "Applications" ||
      context.title.startsWith("Applications/")
        ? createElement(
            "div",
            {
              style: {
                width: "100%",
                height: "100vh",
                fontFamily: "system-ui",
              },
            },
            createElement(Story)
          )
        : createElement(Story),
  ],
  parameters: {
    layout: "fullscreen",
    options: {
      panelPosition: "right",
      storySort: {
        method: "alphabetical",
        includeNames: true,
        // Scope owns its diagnostics. A single example does not need a folder.
        order: [
          "Applications",
          ["Point Clouds", "Georadar", "*"],
          "Terrain and Atmosphere",
          [
            "Projections",
            [
              "Mesh Alignment",
              ["Reference", "Transform strategies · one mesh", "*"],
              "Shared Views",
              "Reference Surfaces",
              "Elevation Stripes",
              "Long Axis Telelens",
              "*",
            ],
            "Terrain Horizon",
            ["Reference", "*", "Sunset · curvature comparison · review"],
            "*",
          ],
          "Shadows",
          [
            "Sun Disc",
            [
              "Reference",
              "Point Sun",
              "Penumbra Detail",
              "Thin Occluders",
              "*",
              "Float32 precision reference",
            ],
            "Corridors",
            [
              "Reference",
              "Columns",
              "Floating Casters",
              "Retained shadows on drag",
              "*",
              "Cache reuse · camera cycle",
            ],
            "*",
            "Cached RGB lighting · experiment",
          ],
          "Tile Loading Manager",
          [
            "Reference",
            ["Mesh Coverage", "Viewport Request Padding", "*"],
            "Camera Views",
            [
              "Toelleturm panorama",
              "Hkw Chimney Top Panorama",
              "Rathaus roof panorama · review",
              "Rathaus perimeter unroll · review",
              "Wupper north bank unroll · review",
              "HKW chimney object cover · review",
              "*",
            ],
            "Lights",
            [
              "Orbiting Chimney Lights",
              "Rathaus Streetlights",
              "Barmen baked night lights + traffic · review",
              "*",
            ],
            "*",
          ],
          "Map Navigation",
          [
            "Perspective",
            "Orthographic",
            "Resolution Scale",
            "Multi Camera Workbench",
            "Engine Controls",
            ["Leaflet", "MapLibre GL JS", "Cesium", "*"],
            "Engine Switching",
            ["Cesium Leaflet", "Leaflet Cesium", "*", "Debugging"],
            "*",
            "Camera and Scale",
            [
              "Zoom by Range and Resolution Reference",
              "*",
              "Perspective Clip Planes",
            ],
          ],
          "Annotations",
          [
            "Measurements",
            [
              "Straight 3D Line Primitives",
              "InfoBox States",
              "InfoBox Matrix",
              "*",
              "Contact Sheet",
            ],
            "Labels",
            [
              "Component",
              "States and Themes",
              "Backgrounds",
              "DOM Layout Engine",
              "*",
              "Cesium Projection Benchmark",
              "Experiments",
            ],
            "Cursors",
            ["Cursor Design", "Disc Sampler", "*", "Diagnostics"],
            "*",
          ],
          "UI",
          [
            "Carma Card + InfoBox",
            "Compass Needle",
            "Connector Ribbon",
            "Gizmos",
            [
              "Dynamic Scene Reference Object Sizing",
              "Cesium Integration",
              "SVG Reprojection",
              "Primitives",
              ["Disc", "Ring", "Ring Segment", "*", "Stress Test"],
              "*",
              "Surface Pick Exclusions",
              "Gizmo Never Picks Itself",
              "Own Geometry As Surface (Opt-in)",
              "CSS View Matrix (WIP)",
            ],
            "Line Styles",
            ["Length-Aware Dash Cases", "Length-Aware Dash Playground", "*"],
            "*",
            "Formatting",
            [
              "Decimal Number",
              "Significant Number",
              "Angle",
              "Length",
              "Area",
              "Geo",
              "*",
            ],
          ],
          "*",
        ],
      },
    },
    controls: { expanded: false, sort: "requiredFirst" },
  },
};

export default preview;
