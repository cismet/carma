/**
 * Leaflet Type Extensions
 * Type augmentations for Leaflet plugins and custom functionality
 */

import L from "leaflet";

declare module "leaflet" {
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
      distance: string; // Formatted string like "123.45 m" or "1.23 km"
      number: number;
      area?: string | null; // Formatted string like "123.45 m²" or "1.23 km²" (null for lines)
      shapeType: "line" | "polygon";
      customTitle?: string;
    }

    interface DrawHandler {
      _poly?: { _latlngs: L.LatLng[] };
      _enabled?: boolean;
      enable(): void;
      disable(): void;
      completeShape?: () => void;
      addVertex?(latlng: L.LatLng): void;
    }

    class MeasurePolygon extends Control {
      options: MeasurePolygonOptions;
      _map: L.Map;
      _measureLayers: L.LayerGroup;
      _measureHandler: L.Draw.Polyline | L.Draw.Polygon | DrawHandler;
      _lastOriginalClick: { latlng: L.LatLng; containerPoint: L.Point };

      drawingPolygons(map: L.Map): void;
      drawingLines(map: L.Map, event: L.LeafletMouseEvent): void;
      onAdd(map: L.Map): HTMLElement;
      _clearMeasurements(): void;
      changeColorByActivePolyline(map: L.Map, customID: number | string): void;
      changeColorByLastShape(map: L.Map): void;
      showLastPolylineOnFirstLoding(map: L.Map): void;
      getVisiblePolylines(map: L.Map): L.Polyline[];
      getVisiblePolylinesIds(polylines: L.Polyline[]): void;
      getAllPolylines(map: L.Map): L.Polyline[];
      removePolylineById(map: L.Map, customID: number | string): void;
      fitMapToAllPolylines(map: L.Map): void;
      fitMapToPolylines(map: L.Map, polylines: L.Polyline[]): void;
      convertPolylineToPolygon(map: L.Map, layer: L.Polyline): void;
      loadMeasurements(map?: L.Map): void;
      _toggleMeasurementBtn(): void;
      toggleMeasurementMode(ifChangeMode?: boolean, map?: L.Map): void;
      _UpdateDistance(layer: L.Polyline): string;
      _toggleMeasure(
        id: string,
        iconActive: string,
        inactiveIcon: string
      ): void;
      calculateArea(coordinates: number[][]): string;
      calculateDistance(latlngs: L.LatLng[]): number;
      formatDistance(distance: number): string;
      saveShapeHandler(
        layer: L.Polyline,
        distance: string | null,
        area: string | null,
        map: L.Map
      ): void;
      _onPolylineDrag(event: L.LeafletEvent): void;
      replaceLineToPolygon(map: L.Map, layer: L.Polyline): MeasurementShapeData;
      getVisibleShapeIdsArr(map: L.Map): (number | string)[];
      _UpdateDistanceByLatLngs(coordinates: number[][]): string;
      showActiveShape(map: L.Map, coordinates: number[][]): void;
      changeMeasurementMode(mode: string, map: L.Map): void;
      changeMeasurementsArr(arr: MeasurementShapeData[]): void;
      findLastCreatedLayer(layerGroup: L.LayerGroup): L.Layer | null;
      cancelDrawing(): void;
      startDrawing(): void;
      _onPolygonClick(map: L.Map, event: L.LeafletMouseEvent): void;
      _UpdateAreaperimeter(layer: L.Polygon): void;
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
      snappingLatlng: L.LatLng | null;
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
    enableEdit?: () => void;
    disableEdit?: () => void;
  }

  interface Polygon {
    customID?: number | string;
    customShape?: string;
    customHandle?: number;
    _path?: SVGPathElement;
    enableEdit?: () => void;
    disableEdit?: () => void;
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
    getLatLng?: () => L.LatLng;
  }

  interface Map {
    _panes?: { popupPane: HTMLElement; [key: string]: HTMLElement };
    _leaflet_id?: number;
  }

  namespace Draw {
    interface DrawMap extends L.Map {
      mergeOptions(options: any): void;
      addInitHook(fn: () => void): void;
    }
  }

  interface LeafletEvent {
    layerType?: string;
    layers?: L.LayerGroup;
  }

  interface Layer {
    _leaflet_id?: number;
  }
}
