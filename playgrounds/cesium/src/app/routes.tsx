import Geojson from './views/obsolete/Geojson';
import ClassifyByGeoJson from './views/ClassifyByGeoJson';
//import SingleGeojson from './views/obsolete/SingleGeojsonSelector';
import TilesetSelectionFromCityGml from './views/TilesetSelectionFromCityGml';
import TilesetSelectionFromBaseMapDE from './views/TilesetSelectionBasemapDe';
import TilesetSelectionClassify from './views/TilesetSelectionClassify';
//import Full from './views/obsolete/Full';
//import WithMesh from './views/obsolete/WithMesh';
import TestCustomViewer from './views/tests/CustomViewer';
import TestGeojson from './views/tests/obsolete/Geojson';
import TestClassifyByGeoJson from './views/tests/ClassifyByGeoJson';
import TestGeojsonWithCityGML from './views/tests/CityGml';
import TestTileset from './views/tests/Tileset';
import TestMarkers from './views/tests/Markers';

import ViewResium from './views/tests/Resium';
import ViewTailwind from './views/tests/Tailwind';

import { ComponentType } from 'react';

export type RouteItem = [string, string, ComponentType];

export type RoutePath = [string, string, RouteItem[] | RoutePath[]];

export type RouteDescriptor = RouteItem | RoutePath;

// views or features 🚧 under heavy construction
// ⚙️ for debug or test views

export const viewerRoutes: RouteDescriptor[] = [
  ['/', '', ClassifyByGeoJson],
  ['/geojson-classify', 'Klassifizierung nach GeoJson', ClassifyByGeoJson],
  [
    '/tileset',
    'Tileset 🚧',
    [
      ['/citygml', 'Tiles CityGML 🚧', TilesetSelectionFromCityGml],
      ['/citygml-classify', 'Classify by CityGML 🚧', TilesetSelectionClassify],
      ['/basemap-de', 'Tiles BaseMap.de 🚧', TilesetSelectionFromBaseMapDE],
    ],
  ],

  //['/full', 'Full', Full],
  //['/mesh', 'Mesh', WithMesh],
  [
    '/test',
    '⚙️ Test',
    [
      ['/', 'Test Home', TestCustomViewer],
      ['/geojson', 'GeoJson', TestClassifyByGeoJson],
      ['/geojson-old', 'GeoJson(old)', TestGeojson],
      ['/citygml', 'Test GeoJson With CityGML', TestGeojsonWithCityGML],
      ['/poi', 'POI Markers', TestMarkers],
      ['/viewer', 'Test Viewer', TestCustomViewer],
      ['/tileset', 'Test Tileset', TestTileset],
    ],
  ],
];

export const otherRoutes: RouteDescriptor[] = [
  [
    '/testapp',
    'No Viewer',
    [
      ['/resium', 'Resium', ViewResium],
      ['/tailwind', 'Tailwind', ViewTailwind],
    ],
  ],
];

export default viewerRoutes;
