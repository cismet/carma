import {
  Polyline,
  Polygon,
  Marker,
  Layer,
  Control,
  ControlOptions,
  LayerGroup,
  LatLng,
  Point,
  LeafletMouseEvent,
  LeafletEvent,
  Map as LeafletMap,
} from "@carma/leaflet";

// Extended interfaces for measurement-specific objects
export interface MeasurementPolyline extends Polyline {
  customID?: number | string;
  customShape?: string;
  _path?: SVGPathElement;
  _leaflet_id?: number;
  enableEdit?: () => void;
  disableEdit?: () => void;
}

export interface MeasurementPolygon extends Polygon {
  customID?: number | string;
  customShape?: string;
  customHandle?: number;
  _path?: SVGPathElement;
  enableEdit?: () => void;
  disableEdit?: () => void;
}

export interface MeasurementMarker extends Marker {
  customHandle?: number;
}

export interface MeasurementLayer extends Layer {
  customID?: number | string;
  customHandle?: number;
  _path?: SVGPathElement;
  enableEdit?: () => void;
  disableEdit?: () => void;
  getLatLng?: () => LatLng;
  _leaflet_id?: number;
}

export interface MeasurementLeafletEvent extends LeafletEvent {
  layerType?: string;
  layers?: LayerGroup;
}

export interface MeasurementShapeData {
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

export interface DrawHandler {
  _poly?: { _latlngs: LatLng[] };
  _enabled?: boolean;
  enable(): void;
  disable(): void;
  completeShape?: () => void;
  addVertex?(latlng: LatLng): void;
  _markers?: MeasurementMarker[];
}

export interface MeasurePolygonOptions extends ControlOptions {
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

export interface MeasurePolygonControl extends Control {
  options: MeasurePolygonOptions;
  _map: LeafletMap;
  _measureLayers: LayerGroup;
  _measureHandler: any;
  _lastOriginalClick: { latlng: LatLng; containerPoint: Point };

  _mapClickHandler?: (event: LeafletMouseEvent) => void;
  _drawCreatedHandler?: (event: any) => void;
  _drawDrawstartHandler?: (event: any) => void;
  _drawDrawvertexHandler?: (event: any) => void;
  _drawCanceledHandler?: () => void;
  _moveendHandler?: (event: any) => void;
  _mousemoveHandler?: (event: LeafletMouseEvent) => void;
  _mouseoutHandler?: (event: LeafletMouseEvent) => void;
  _vertexClickHandler?: (event: LeafletMouseEvent) => void;
  _isFinishingShape?: boolean;
  drawingLines(map: LeafletMap, event: LeafletMouseEvent): void;

  onAdd(map: LeafletMap): HTMLElement;
  _clearMeasurements(): void;
  changeColorByActivePolyline(map: LeafletMap, customID: number | string): void;
  changeColorByLastShape(map: LeafletMap): void;
  showLastPolylineOnFirstLoding(map: LeafletMap): void;
  getVisiblePolylines(map: LeafletMap): MeasurementPolyline[];
  getVisiblePolylinesIds(polylines: MeasurementPolyline[]): void;
  getAllPolylines(map: LeafletMap): MeasurementPolyline[];
  removePolylineById(map: LeafletMap, customID: number | string): void;
  fitMapToAllPolylines(map: LeafletMap): void;
  fitMapToPolylines(map: LeafletMap, polylines: MeasurementPolyline[]): void;
  convertPolylineToPolygon(map: LeafletMap, layer: MeasurementPolyline): void;
  loadMeasurements(map?: LeafletMap): void;
  _toggleMeasurementBtn(): void;
  toggleMeasurementMode(ifChangeMode?: boolean, map?: LeafletMap): void;
  _UpdateDistance(layer: MeasurementPolyline): string;
  _toggleMeasure(id: string, iconActive: string, inactiveIcon: string): void;
  calculateArea(coordinates: number[][]): string;
  calculateDistance(latlngs: LatLng[]): number;
  formatDistance(distance: number): string;
  saveShapeHandler(
    layer: MeasurementPolyline,
    distance: string | null,
    area: string | null,
    map: LeafletMap
  ): void;
  _onPolylineDrag(event: LeafletEvent): void;
  replaceLineToPolygon(
    map: LeafletMap,
    layer: MeasurementPolyline
  ): MeasurementShapeData;
  getVisibleShapeIdsArr(map: LeafletMap): (number | string)[];
  _UpdateDistanceByLatLngs(coordinates: number[][]): string;
  showActiveShape(map: LeafletMap, coordinates: number[][]): void;
  changeMeasurementMode(mode: string, map: LeafletMap): void;
  changeMeasurementsArr(arr: MeasurementShapeData[]): void;
  findLastCreatedLayer(layerGroup: LayerGroup): Layer | null;
  cancelDrawing(): void;
  startDrawing(): void;
  _onPolygonClick(map: LeafletMap, event: LeafletMouseEvent): void;
  _UpdateAreaperimeter(layer: MeasurementPolygon): void;
}

declare module "leaflet" {
  namespace Control {
    interface MeasurementShapeData extends MeasurementShapeData {}
    interface DrawHandler extends DrawHandler {}
    interface MeasurePolygonOptions extends MeasurePolygonOptions {}
    class MeasurePolygon extends Control implements MeasurePolygonControl {
      options: MeasurePolygonOptions;
      _map: LeafletMap;
      _measureLayers: LayerGroup;
      _measureHandler: any;
      _lastOriginalClick: { latlng: LatLng; containerPoint: Point };

      _mapClickHandler?: (event: LeafletMouseEvent) => void;
      _drawCreatedHandler?: (event: any) => void;
      _drawDrawstartHandler?: (event: any) => void;
      _drawDrawvertexHandler?: (event: any) => void;
      _drawCanceledHandler?: () => void;
      _moveendHandler?: (event: any) => void;
      _mousemoveHandler?: (event: LeafletMouseEvent) => void;
      _mouseoutHandler?: (event: LeafletMouseEvent) => void;
      _vertexClickHandler?: (event: LeafletMouseEvent) => void;
      _isFinishingShape?: boolean;
      drawingLines(map: LeafletMap, event: LeafletMouseEvent): void;

      onAdd(map: LeafletMap): HTMLElement;
      _clearMeasurements(): void;
      changeColorByActivePolyline(
        map: LeafletMap,
        customID: number | string
      ): void;
      changeColorByLastShape(map: LeafletMap): void;
      showLastPolylineOnFirstLoding(map: LeafletMap): void;
      getVisiblePolylines(map: LeafletMap): MeasurementPolyline[];
      getVisiblePolylinesIds(polylines: MeasurementPolyline[]): void;
      getAllPolylines(map: LeafletMap): MeasurementPolyline[];
      removePolylineById(map: LeafletMap, customID: number | string): void;
      fitMapToAllPolylines(map: LeafletMap): void;
      fitMapToPolylines(
        map: LeafletMap,
        polylines: MeasurementPolyline[]
      ): void;
      convertPolylineToPolygon(
        map: LeafletMap,
        layer: MeasurementPolyline
      ): void;
      loadMeasurements(map?: LeafletMap): void;
      _toggleMeasurementBtn(): void;
      toggleMeasurementMode(ifChangeMode?: boolean, map?: LeafletMap): void;
      _UpdateDistance(layer: MeasurementPolyline): string;
      _toggleMeasure(
        id: string,
        iconActive: string,
        inactiveIcon: string
      ): void;
      calculateArea(coordinates: number[][]): string;
      calculateDistance(latlngs: LatLng[]): number;
      formatDistance(distance: number): string;
      saveShapeHandler(
        layer: MeasurementPolyline,
        distance: string | null,
        area: string | null,
        map: LeafletMap
      ): void;
      _onPolylineDrag(event: LeafletEvent): void;
      replaceLineToPolygon(
        map: LeafletMap,
        layer: MeasurementPolyline
      ): MeasurementShapeData;
      getVisibleShapeIdsArr(map: LeafletMap): (number | string)[];
      _UpdateDistanceByLatLngs(coordinates: number[][]): string;
      showActiveShape(map: LeafletMap, coordinates: number[][]): void;
      changeMeasurementMode(mode: string, map: LeafletMap): void;
      changeMeasurementsArr(arr: MeasurementShapeData[]): void;
      findLastCreatedLayer(layerGroup: LayerGroup): Layer | null;
      cancelDrawing(): void;
      startDrawing(): void;
      _onPolygonClick(map: LeafletMap, event: LeafletMouseEvent): void;
      _UpdateAreaperimeter(layer: MeasurementPolygon): void;
    }
  }

  namespace control {
    function measurePolygon(
      options?: Partial<Control.MeasurePolygonOptions>
    ): Control.MeasurePolygon;
  }
}
