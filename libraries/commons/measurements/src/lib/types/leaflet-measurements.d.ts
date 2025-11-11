/// <reference types="leaflet" />
/// <reference types="leaflet-draw" />

declare module "leaflet" {
  namespace Marker {
    class Measurement extends Layer {
      constructor(
        latlng: LatLngExpression,
        measurement: string,
        title: string,
        rotation: number,
        options?: any
      );
    }
  }

  namespace marker {
    function measurement(
      latLng: LatLngExpression,
      measurement: string,
      title: string,
      rotation: number,
      options?: any
    ): Marker.Measurement;
  }

  namespace Control {
    interface MeasurePolygonOptions extends ControlOptions {
      position?: ControlPosition;
      icon_lineActive?: string;
      icon_lineInactive?: string;
      icon_polygonActive?: string;
      icon_polygonInactive?: string;
      html_template?: string;
      height?: number;
      width?: number;
      mode_btn?: string;
      color_polygon?: string;
      fillColor_polygon?: string;
      weight_polygon?: string;
      checkonedrawpoligon?: boolean;
      changeModeButtonActive?: boolean;
      msj_disable_tool?: string;
      shapes?: any[];
      activeShape?: any;
      shapeMode?: "line" | "polygon";
      measurementOrder?: number;
      moveToShape?: boolean;
      snappingEnabled?: boolean;
      snappingQueryRadius?: number;
      snappingLatlng?: LatLng | null;
      device?: "Desktop" | "Mobile" | null;
      // Callback functions
      cb?: () => void;
      cbSaveShape?: (shape: any) => void;
      cdDeleteShape?: (shapeId: string | number, store: any[]) => void;
      cbUpdateShape?: (
        shapeId: string | number,
        coords: any,
        distance: string,
        area: string | null
      ) => void;
      cbVisiblePolylinesChange?: (ids: any[]) => void;
      cbSetDrawingStatus?: (status: boolean) => void;
      cbSetDrawingShape?: (shape: any) => void;
      cbSetActiveShape?: (shapeId: string | number) => void;
      cbSetUpdateStatusHandler?: (status: boolean) => void;
      cbMapMovingEndHandler?: (status: boolean) => void;
      cbSaveLastActiveShapeIdBeforeDrawingHandler?: () => void;
      cbChangeActiveCanceldShapeId?: () => void;
      cbToggleMeasurementMode?: () => void;
      cbGetMeasurementModeHandler?: () => void;
      cbDeleteVisibleShapeById?: (shapeId: string | number) => void;
      cbUpdateAreaOfDrawingMeasurement?: (area: string | null) => void;
      cbSetCurrentDrawHandler?: (handler: any) => void;
      cbSetMapStatus?: (status: string) => void;
    }

    class MeasurePolygon extends Control {
      constructor(options?: MeasurePolygonOptions);
      options: MeasurePolygonOptions;

      drawingPolygons(map: Map): void;
      drawingLines(map: Map, event: any): void;
      startDrawing(): void;
      saveShapeHandler(
        layer: any,
        distance?: string | null,
        area?: string | null,
        map?: Map
      ): void;
      changeColorByActivePolyline(map: Map, customID: string | number): void;
      changeColorByLastShape(map: Map): void;
      getVisiblePolylines(map: Map): any[];
      getVisiblePolylinesIds(polylinesArr: any[]): void;
      getAllPolylines(map: Map): any[];
      removePolylineById(map: Map, customID: string | number): void;
      showActiveShape(map: Map, coordinates: any[]): void;
      fitMapToPolylines(map: Map, polylines: any[]): void;
      replaceLineToPolygon(map: Map, layer: any): any;
      getVisibleShapeIdsArr(map: Map): void;
      findLastCreatedLayer(layerGroup: LayerGroup): Layer | null;
      loadMeasurements(map: Map): void;
      toggleMeasurementMode(ifChangeMode?: boolean, map?: Map): void;
      changeMeasurementMode(mode: string, map?: Map): void;
      changeMeasurementsArr(arr: any[]): void;
      cancelDrawing(): void;
      calculateDistance(latlngs: LatLng[]): number;
      calculateArea(latlngs: number[][]): string;
      formatDistance(perimeter: number): string;
    }
  }

  namespace control {
    function measurePolygon(
      options?: Control.MeasurePolygonOptions
    ): Control.MeasurePolygon;
  }

  interface PolylineOptions {
    showMeasurements?: boolean;
    measurementOptions?: {
      showOnHover?: boolean;
      minPixelDistance?: number;
      showDistances?: boolean;
      showArea?: boolean;
      showTotalDistance?: boolean;
      imperial?: boolean;
      ha?: boolean;
      formatDistance?: (d: number) => string;
      formatArea?: (a: number) => string;
      lang?: {
        totalLength?: string;
        totalArea?: string;
        segmentLength?: string;
      };
    };
  }

  interface Polyline {
    _measurementLayer?: LayerGroup;
    _measurementOptions?: any;

    showMeasurements(options?: any): this;
    hideMeasurements(): this;
    updateMeasurements(): this;
    formatDistance(d: number): string;
    formatArea(a: number): string;
    getCentroid(points: LatLng[]): [number, number];
    _getRotation(ll1: LatLng, ll2: LatLng): number;
  }
}
