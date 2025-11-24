import type { GeoJSONOptions, GeoJSON as LGeoJSON } from "leaflet";
import "leaflet"; // ensure module augmentation is applied

declare module "leaflet" {
  /** Additional constants not exposed by default typings */
  namespace DomUtil {
    /** CSS transform property name resolved at runtime (Leaflet internal). */
    const TRANSFORM: string;
  }

  /** Support for the proj4leaflet extension if present. */
  namespace Proj {
    /**
     * Create a GeoJSON layer reprojected via Proj4Leaflet. When the proj plugin
     * isn't loaded this will be undefined at runtime, so consumers must guard.
     */
    function geoJson(
      geojson: GeoJSON.GeoJsonObject | GeoJSON.GeoJsonObject[],
      options?: GeoJSONOptions
    ): LGeoJSON;
  }

  // Measurement plugin (leaflet-measure-path)
  namespace Control {
    interface MeasurementShapeData {
      coordinates: number[][];
      options: {
        color: string;
        fillColor: string | null;
        opacity: number;
        weight: number;
      };
      shapeId: number | string;
      distance: string;
      number: number;
      area?: string | null;
      shapeType: "line" | "polygon";
      customTitle?: string;
    }

    interface DrawHandler {
      _poly?: { _latlngs: LatLng[] };
      _enabled?: boolean;
      enable(): void;
      disable(): void;
      completeShape?: () => void;
      addVertex?(latlng: LatLng): void;
    }

    class MeasurePolygon extends Control {
      options: MeasurePolygonOptions;
      _map: Map;
      _measureLayers: LayerGroup;
      _measureHandler: Draw.Polyline | Draw.Polygon | DrawHandler;
      _lastOriginalClick: { latlng: LatLng; containerPoint: Point };

      drawingPolygons(map: Map): void;
      drawingLines(map: Map, event: LeafletMouseEvent): void;
      onAdd(map: Map): HTMLElement;
      _clearMeasurements(): void;
      changeColorByActivePolyline(map: Map, customID: number | string): void;
      changeColorByLastShape(map: Map): void;
      showLastPolylineOnFirstLoding(map: Map): void;
      getVisiblePolylines(map: Map): Polyline[];
      getVisiblePolylinesIds(polylines: Polyline[]): void;
      getAllPolylines(map: Map): Polyline[];
      removePolylineById(map: Map, customID: number | string): void;
      fitMapToAllPolylines(map: Map): void;
      fitMapToPolylines(map: Map, polylines: Polyline[]): void;
      convertPolylineToPolygon(map: Map, layer: Polyline): void;
      loadMeasurements(map?: Map): void;
      _toggleMeasurementBtn(): void;
      toggleMeasurementMode(ifChangeMode?: boolean, map?: Map): void;
      _UpdateDistance(layer: Polyline): string;
      _toggleMeasure(
        id: string,
        iconActive: string,
        inactiveIcon: string
      ): void;
      calculateArea(coordinates: number[][]): string;
      calculateDistance(latlngs: LatLng[]): number;
      formatDistance(distance: number): string;
      saveShapeHandler(
        layer: Polyline,
        distance: string | null,
        area: string | null,
        map: Map
      ): void;
      _onPolylineDrag(event: LeafletEvent): void;
      replaceLineToPolygon(map: Map, layer: Polyline): MeasurementShapeData;
      getVisibleShapeIdsArr(map: Map): (number | string)[];
      _UpdateDistanceByLatLngs(coordinates: number[][]): string;
      showActiveShape(map: Map, coordinates: number[][]): void;
      changeMeasurementMode(mode: string, map: Map): void;
      changeMeasurementsArr(arr: MeasurementShapeData[]): void;
      findLastCreatedLayer(layerGroup: LayerGroup): Layer | null;
      cancelDrawing(): void;
      startDrawing(): void;
      _onPolygonClick(map: Map, event: LeafletMouseEvent): void;
      _UpdateAreaperimeter(layer: Polygon): void;
    }

    interface MeasurePolygonOptions extends ControlOptions {
      icon_lineActive: string;
      icon_lineInactive: string;
      icon_polygonActive: string;
      icon_polygonInactive: string;
      html_template: string;
      height: number;
      width: number;
      mode_btn: string;
      color_polygon: string;
      fillColor_polygon: string;
      weight_polygon: string;
      isDrawing: boolean;
      changeModeButtonActive: boolean;
      msj_disable_tool: string;
      shapes: MeasurementShapeData[];
      activeShape: number | string | null;
      shapeMode: "line" | "polygon";
      measurementOrder: number;
      moveToShape: boolean | MeasurementShapeData | null;
      cb: () => void;
      cbSaveShape: (shape: MeasurementShapeData) => void;
      cdDeleteShape: (
        id: number | string,
        localShapeStore: MeasurementShapeData[]
      ) => void;
      cbUpdateShape: (
        id: number | string,
        newCoordinates: number[][],
        newDistance: string,
        newSquare: string | null
      ) => void;
      cbVisiblePolylinesChange: (ids: (number | string)[]) => void;
      cbSetDrawingStatus: (status: boolean) => void;
      cbSetDrawingShape: (shape: MeasurementShapeData | null) => void;
      cbSetActiveShape: (id: number | string) => void;
      cbSetUpdateStatusHandler: (status: boolean) => void;
      cbMapMovingEndHandler: (status: boolean) => void;
      cbSaveLastActiveShapeIdBeforeDrawingHandler: () => void;
      cbChangeActiveCanceldShapeId: () => void;
      cbToggleMeasurementMode: () => void;
      cbGetMeasurementModeHandler: () => void;
      cbDeleteVisibleShapeById: (id: number | string) => void;
      cbUpdateAreaOfDrawingMeasurement: (area: string | null) => void;
      cbSetCurrentDrawHandler: (handler: DrawHandler | null) => void;
      cbSetMapStatus?: (status: string) => void;
      visiblePolylines: (string | number)[];
      localShapeStore: MeasurementShapeData[];
      isDrawingEmpty: boolean;
      nativeMove: boolean;
      currenLine: DrawHandler | null;
      polygonMode: boolean;
      measurementMode: string | boolean;
      startDrawing: boolean;
      customTooltip: HTMLElement | null;
      device: "desktop" | "mobile" | "tablet" | "Desktop" | null;
      clickAfterShapeSelection: boolean;
      snappingLatlng: LatLng | null;
      snappingEnabled: boolean;
      snappingQueryRadius?: number;
    }
  }

  namespace control {
    function measurePolygon(
      options?: Partial<Control.MeasurePolygonOptions>
    ): Control.MeasurePolygon;
  }

  interface Polyline {
    customID?: number | string;
    customShape?: string;
    _path?: SVGPathElement;
    _leaflet_id?: number;
    _measurementLayer?: L.LayerGroup;
    _measurementOptions?: any;
    showMeasurements?: (options?: any) => this;
    hideMeasurements?: () => this;
    updateMeasurements?: () => void;
    formatDistance?: (distance: number) => string;
    formatArea?: (area: number) => string;
    _getRotation?: (ll1: L.LatLng, ll2: L.LatLng) => number;
    getCentroid?: (latlngs: L.LatLng[]) => L.LatLng;
    enableEdit?: () => void;
    disableEdit?: () => void;
  }

  interface Polygon {
    customID?: number | string;
    customShape?: string;
    customHandle?: number;
    _path?: SVGPathElement;
    _measurementLayer?: L.LayerGroup;
    _measurementOptions?: any;
    showMeasurements?: (options?: any) => this;
    hideMeasurements?: () => this;
    updateMeasurements?: () => void;
    formatDistance?: (distance: number) => string;
    formatArea?: (area: number) => string;
    _getRotation?: (ll1: L.LatLng, ll2: L.LatLng) => number;
    getCentroid?: (latlngs: L.LatLng[]) => L.LatLng;
    enableEdit?: () => void;
    disableEdit?: () => void;
  }

  namespace Marker {
    interface MeasurementOptions {
      pane?: string;
      showOnHover?: boolean;
      minPixelDistance?: number;
      showDistances?: boolean;
      showArea?: boolean;
      showTotalDistance?: boolean;
      imperial?: boolean;
      ha?: boolean;
      formatDistance?: (distance: number) => string;
      formatArea?: (area: number) => string;
      lang?: {
        totalLength?: string;
        totalArea?: string;
        segmentLength?: string;
      };
    }

    class Measurement extends L.Layer {
      options: MeasurementOptions;
      _latlng: L.LatLng;
      _measurement: string;
      _title: string;
      _rotation: number;
      _map: L.Map;
      _element: HTMLElement;

      constructor(
        latlng: L.LatLng,
        measurement: string,
        title: string,
        rotation: number,
        options?: MeasurementOptions
      );

      addTo(map: L.Map): this;
      onAdd(map: L.Map): this;
      onRemove(map: L.Map): this;
      _setPosition(): void;
      _animateZoom(opt: { zoom: number; center: L.LatLng }): void;
    }
  }

  namespace marker {
    function measurement(
      latLng: L.LatLng,
      measurement: string,
      title: string,
      rotation: number,
      options?: Marker.MeasurementOptions
    ): Marker.Measurement;
  }

  interface PolylineOptions {
    showMeasurements?: boolean;
    measurementOptions?: Marker.MeasurementOptions;
  }

  interface Marker {
    customHandle?: number;
  }

  interface Layer {
    customID?: number | string;
    customHandle?: number;
    _path?: SVGPathElement;
    enableEdit?: () => void;
    disableEdit?: () => void;
    getLatLng?: () => LatLng;
    _leaflet_id?: number;
  }

  interface Map {
    _panes?: { popupPane: HTMLElement; [key: string]: HTMLElement };
  }

  namespace Draw {
    interface DrawMap extends Map {
      mergeOptions(options: any): void;
      addInitHook(fn: () => void): void;
    }
  }

  interface LeafletEvent {
    layerType?: string;
    layers?: LayerGroup;
  }
}
