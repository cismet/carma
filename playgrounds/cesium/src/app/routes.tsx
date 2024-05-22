import Geojson from './views/Geojson';
import SingleGeojson from './views/SingleGeojsonSelector';
//import Full from './views/obsolete/Full';
//import WithMesh from './views/obsolete/WithMesh';
import TestCustomViewer from './views/tests/CustomViewer';
import TestGeojson from './views/tests/Geojson';
import TestGeojsonWithCityGML from './views/tests/CityGml';
import TestTileset from './views/tests/Tileset';

import ViewResium from './views/tests/Resium';
import ViewTailwind from './views/tests/Tailwind';

import { ComponentType } from 'react';

export type RouteItem = [string, string, ComponentType];

export type RoutePath = [string, string, RouteItem[] | RoutePath[]];

export type RouteDescriptor = RouteItem | RoutePath;

export const viewerRoutes: RouteDescriptor[] = [
  ['/', 'Home', SingleGeojson],
  ['/geojson', 'GeoJson', Geojson],
  //['/full', 'Full', Full],
  //['/mesh', 'Mesh', WithMesh],
  [
    '/test',
    'Test',
    [
      ['/', 'Test Home', TestCustomViewer],
      ['/geojson', 'Test GeoJson', TestGeojson],
      ['/citygml', 'Test GeoJson With CityGML', TestGeojsonWithCityGML],
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
