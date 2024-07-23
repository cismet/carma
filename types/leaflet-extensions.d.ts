import * as L from '@types/leaflet';

declare module 'leaflet' {
  function setOptions(any, options: any): void;
  const divIcon: (options: any) => L.DivIcon;
  namespace Proj {
    function geoJson(geojson: any): L.GeoJSON;
  }
  namespace DomEvent {
    const disableClickPropagation = (button: unknown) => any;
    function on(
      element: any,
      event: string,
      callback: any,
      context?: any,
    ): void;
  }
  namespace CRS {
    const Simple: any;
  }
  namespace DomUtil {
    const TRANSFORM: string;
    const create = (tagName: string, className: string, container?: any) => any;
  }
}
