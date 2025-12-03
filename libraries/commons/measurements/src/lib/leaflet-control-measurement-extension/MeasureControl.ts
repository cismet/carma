// Create a class for the plugin
import {
  Control,
  DomUtil,
  DomEvent,
  Browser,
  point,
  latLngBounds,
  layerGroup,
  Polyline,
  Polygon,
  LeafletMap,
  LeafletMouseEvent,
  LeafletEvent,
  polygon,
  polyline,
  ControlOptions,
  LayerGroup,
  LatLng,
  Point,
  Layer,
} from "@carma/leaflet";
import * as L from "leaflet";
import "leaflet-draw";
import "@carma/types";
import {
  calculateArea,
  calculateDistance,
  formatDistance,
  updateDistance,
  updateDistanceByLatLngs,
} from "../utils/measurement-geometry";
import { createVertexClickHandler } from "../utils/vertex-click-handler";
import { TOOLTIP_LABELS } from "../labels";
import {
  distanceBetweenLatLng,
  EXACT_MATCH_METERS,
  isFirstVertexMatch,
} from "../utils/snapping";
import { DRAWING_SHAPE_ID } from "../utils/constants";
import {
  MeasurementPolyline,
  MeasurementPolygon,
  MeasurementLayer,
  MeasurementLeafletEvent,
  MeasurementShapeData,
} from "../types";

// --- Type Definitions ---

export interface MeasurementMarker extends L.Marker {
  customHandle?: number;
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

export interface MeasureControlOptions extends ControlOptions {
  icon_lineActive: string;
  icon_lineInactive: string;
  icon_polygonActive: string;
  icon_polygonInactive: string;
  html_template: string;
  height: number;
  width: number;
  mode_btn: string;
  isDrawing: boolean;
  changeModeButtonActive: boolean;
  msj_disable_tool: string;
  shapes: MeasurementShapeData[];
  activeShape: number | string | symbol | null;
  shapeMode: "line" | "polygon";
  measurementOrder: number;
  moveToShape: boolean | MeasurementShapeData | null;
  cb: () => void;
  cbSaveShape: (shape: MeasurementShapeData) => void;
  cbDeleteShape: (
    id: number | string | symbol,
    localShapeStore: MeasurementShapeData[]
  ) => void;
  cbUpdateShape: (
    id: number | string | symbol,
    newCoordinates: number[][],
    newDistance: string,
    newSquare: string | null
  ) => void;
  cbVisiblePolylinesChange: (ids: (number | string | symbol)[]) => void;
  cbSetDrawingStatus: (status: boolean) => void;
  cbSetDrawingShape: (shape: MeasurementShapeData | null) => void;
  cbSetActiveShape: (id: number | string | symbol) => void;
  cbSetUpdateStatusHandler: (status: boolean) => void;
  cbMapMovingEndHandler: (status: boolean) => void;
  cbSaveLastActiveShapeIdBeforeDrawingHandler: () => void;
  cbChangeActiveCancelledShapeId: () => void;
  cbToggleMeasurementMode: () => void;
  cbGetMeasurementModeHandler: () => void;
  cbDeleteVisibleShapeById: (id: number | string | symbol) => void;
  cbUpdateAreaOfDrawingMeasurement: (area: string | null) => void;
  cbSetCurrentDrawHandler: (handler: DrawHandler | null) => void;
  cbSetMapStatus?: (status: string) => void;
  visiblePolylines: (string | number | symbol)[];
  localShapeStore: MeasurementShapeData[];
  isDrawingEmpty: boolean;
  nativeMove: boolean;
  currentLine: DrawHandler | null;
  polygonMode: boolean;
  enabled: boolean;
  startDrawing: boolean;
  customTooltip: HTMLElement | null;
  device: "desktop" | "mobile" | "tablet" | "Desktop" | null;
  clickAfterShapeSelection: boolean;
  snappingLatlng: LatLng | null;
  snappingEnabled: boolean;
  snappingQueryRadius?: number;
  measurementMode?: "measurement" | "other_mode"; // TODO: check what other modes exist or if this is correct type
}

export interface MeasureControl extends Control {
  options: MeasureControlOptions;
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
    customID: number | string | symbol
  ): void;
  changeColorByLastShape(map: LeafletMap): void;
  showLastPolylineOnFirstLoding(map: LeafletMap): void;
  getVisiblePolylines(map: LeafletMap): MeasurementPolyline[];
  getVisiblePolylinesIds(polylines: MeasurementPolyline[]): void;
  getAllPolylines(map: LeafletMap): MeasurementPolyline[];
  removePolylineById(map: LeafletMap, customID: number | string | symbol): void;
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
  getVisibleShapeIdsArr(map: LeafletMap): (number | string | symbol)[];
  _UpdateDistanceByLatLngs(coordinates: number[][]): string;
  showActiveShape(map: LeafletMap, coordinates: number[][]): void;
  setMeasurementEnabled(enabled: boolean, map: LeafletMap): void;
  changeMeasurementsArr(arr: MeasurementShapeData[]): void;
  findLastCreatedLayer(layerGroup: LayerGroup): Layer | null;
  cancelDrawing(): void;
  startDrawing(): void;
  _onPolygonClick(map: LeafletMap, event: LeafletMouseEvent): void;
  _UpdateAreaperimeter(layer: MeasurementPolygon): void;
}

// Placeholder for icons to not show broken images
// Transparent 1x1 GIF (43 bytes)
// See http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export const MeasureControl = Control.extend({
  options: {
    position: "topright",
    icon_lineActive: TRANSPARENT_PIXEL,
    icon_lineInactive: TRANSPARENT_PIXEL,
    icon_polygonActive: TRANSPARENT_PIXEL,
    icon_polygonInactive: TRANSPARENT_PIXEL,
    html_template: `<p><strong><span style="text-decoration: underline;">${TOOLTIP_LABELS.general.results}</span></strong></p>
<p><strong>${TOOLTIP_LABELS.general.area}: </strong><br>_p_area</p>
<p><strong>${TOOLTIP_LABELS.general.perimeter} : </strong><br>_p_perimeter</p>`,
    height: 130,
    width: 150,
    mode_btn: "",
    isDrawing: false,
    changeModeButtonActive: false,
    msj_disable_tool: TOOLTIP_LABELS.general.disableTool,
    shapes: [],
    activeShape: null,
    shapeMode: "line",
    measurementOrder: 0,
    moveToShape: false,
    cb: function (...args: any[]) {},
    cbSaveShape: function (...args: any[]) {},
    cbDeleteShape: function (...args: any[]) {},
    cbUpdateShape: function (...args: any[]) {},
    cbVisiblePolylinesChange: function (...args: any[]) {},
    cbSetDrawingStatus: function (...args: any[]) {},
    cbSetDrawingShape: function (...args: any[]) {},
    cbSetActiveShape: function (...args: any[]) {},
    cbSetUpdateStatusHandler: function (...args: any[]) {},
    cbMapMovingEndHandler: function (...args: any[]) {},
    cbSaveLastActiveShapeIdBeforeDrawingHandler: function (...args: any[]) {},
    cbChangeActiveCancelledShapeId: function (...args: any[]) {},
    cbToggleMeasurementMode: function (...args: any[]) {},
    cbGetMeasurementModeHandler: function (...args: any[]) {},
    cbDeleteVisibleShapeById: function (...args: any[]) {},
    cbUpdateAreaOfDrawingMeasurement: function (...args: any[]) {},
    cbSetCurrentDrawHandler: function (...args: any[]) {},
    cbSetMapStatus: function (...args: any[]) {},
    visiblePolylines: [],
    localShapeStore: [],
    isDrawingEmpty: true,
    nativeMove: false,
    currentLine: null,
    polygonMode: false,
    enabled: false,
    startDrawing: false,
    customTooltip: null,
    device: null,
    clickAfterShapeSelection: false,
    snappingLatlng: null,
    snappingEnabled: true,
  },

  drawingLines: function (
    this: MeasureControl,
    map: LeafletMap,
    event: LeafletMouseEvent
  ) {
    if (this.options.customTooltip) {
      this.options.customTooltip.style.visibility = "hidden";
    }
    this.options.shapeMode = "line";
    this._measureHandler = new L.Draw.Polyline(map as any, {
      showLength: true,
      shapeOptions: {
        weight: 3,
        color: "#267bdcd4",
        opacity: 1,
      },
    });

    const self = this;

    // Override _updateGuide to snap the preview line
    const originalUpdateGuide = (this._measureHandler as any)._updateGuide;
    if (originalUpdateGuide) {
      (this._measureHandler as any)._updateGuide = function (point: any) {
        if (self.options.snappingLatlng) {
          // If we have a snapping point, use it for the guide line
          // We need to convert the latlng to a layer point, as that's what _updateGuide expects
          const snappedPoint = map.latLngToLayerPoint(
            self.options.snappingLatlng
          );
          return originalUpdateGuide.call(this, snappedPoint);
        }
        return originalUpdateGuide.call(this, point);
      };
    }

    // DIAGNOSTIC: Hook into Leaflet.Draw's internal completion to see what triggers it
    const originalFinishShape = (this._measureHandler as any)._finishShape;
    if (originalFinishShape) {
      (this._measureHandler as any)._finishShape = function (e) {
        const eventInfo = e
          ? {
              type: e.type,
              originalType: e.originalEvent?.type,
              pointerType: e.originalEvent?.pointerType,
              target: e.target?.className,
              timeStamp: e.timeStamp,
            }
          : "no event";

        // CRITICAL: Block Leaflet.Draw's native touch finishing
        // We handle this manually in vertex-click-handler.ts to ensure consistent behavior
        if (
          e &&
          (e.type?.startsWith("touch") ||
            e.originalEvent?.type?.startsWith("touch") ||
            e.originalEvent?.pointerType === "touch")
        ) {
          console.warn(
            "[measure-path] Blocking native _finishShape on touch event",
            eventInfo
          );
          return;
        }

        return originalFinishShape.apply(this, arguments);
      };
    }

    const originalCompleteShape = (this._measureHandler as any).completeShape;
    if (originalCompleteShape) {
      (this._measureHandler as any).completeShape = function () {
        console.warn("[measure-path] 🔴 completeShape() called!", {
          stack: new Error().stack,
          vertexCount: this._markers?.length || 0,
          timestamp: Date.now(),
        });
        return originalCompleteShape.apply(this, arguments);
      };
    }

    const originalAddVertex = (this._measureHandler as any).addVertex;
    if (originalAddVertex) {
      (this._measureHandler as any).addVertex = function (latlng) {
        // Use snapped position if available
        const finalLatlng =
          self.options.snappingEnabled && self.options.snappingLatlng
            ? self.options.snappingLatlng
            : latlng;

        console.debug("[measure-path] addVertex() called", {
          original: latlng,
          snapped: self.options.snappingLatlng,
          final: finalLatlng,
          currentVertexCount: this._markers?.length || 0,
          timestamp: Date.now(),
        });

        // Check for duplicate vertex to prevent 0-length segments
        if (this._markers && this._markers.length > 0) {
          // Check for closing polygon (snapping to first vertex)
          // We use isFirstVertexMatch (requires 3+ vertices) to detect closure
          if (isFirstVertexMatch(this, finalLatlng, EXACT_MATCH_METERS)) {
            console.debug(
              "[measure-path] Closing polygon via addVertex override (snapped to start)"
            );
            // Explicitly set polygon mode
            self.options.shapeMode = "polygon";

            // Set finishing flag to prevent map click from starting new shape
            (self as any)._isFinishingShape = true;

            this._finishShape();
            return;
          }

          const lastMarker = this._markers[this._markers.length - 1];
          if (
            distanceBetweenLatLng(finalLatlng, lastMarker.getLatLng()) <
            EXACT_MATCH_METERS
          ) {
            console.warn(
              "[measure-path] Preventing 0-length segment in addVertex - duplicate vertex ignored"
            );
            return;
          }
        }

        (self as any)._lastVertexAdded = Date.now();
        return originalAddVertex.call(this, finalLatlng);
      };
    }

    this.options.currentLine = this._measureHandler;
    this.options.cbSetCurrentDrawHandler(this._measureHandler);

    const tooltipContent = `${TOOLTIP_LABELS.measurement.finishLine}<br>${TOOLTIP_LABELS.measurement.finishPolygon}`;

    L.drawLocal.draw.handlers.polyline.tooltip.start = `${TOOLTIP_LABELS.measurement.start}<br><span class='leaflet-draw-tooltip-subtext'>${TOOLTIP_LABELS.snapping.active}</span>`;
    L.drawLocal.draw.handlers.polyline.tooltip.cont = `${TOOLTIP_LABELS.measurement.continue}<br><span class='leaflet-draw-tooltip-subtext'>${TOOLTIP_LABELS.snapping.active}</span>`;
    L.drawLocal.draw.handlers.polyline.tooltip.end = tooltipContent;

    this._measureHandler.enable();

    // DIAGNOSTIC: Intercept Leaflet.Draw's built-in dblclick handler
    const originalDblClick = (this._measureHandler as any)._onMouseDblClick;
    if (originalDblClick) {
      console.warn(
        "[measure-path] Found Leaflet.Draw dblclick handler - intercepting"
      );
      (this._measureHandler as any)._onMouseDblClick = function (e) {
        console.error("[measure-path] LEAFLET.DRAW DBLCLICK HANDLER FIRED", {
          eventType: e?.type,
          originalEvent: e?.originalEvent?.type,
          pointerType: e?.originalEvent?.pointerType,
          timeStamp: e?.timeStamp,
          vertexCount: this._markers?.length || 0,
          timestamp: Date.now(),
          stack: new Error().stack,
        });
        return originalDblClick.apply(this, arguments);
      };
    } else {
      console.log(
        "[measure-path] No dblclick handler found on _measureHandler"
      );
    }

    // DIAGNOSTIC: Log all active event listeners on the map
    console.log("[measure-path] Active map event listeners:", {
      hasClick: map.listens("click"),
      hasDblClick: map.listens("dblclick"),
      clickCount: map.listens("click", true),
      dblclickCount: map.listens("dblclick", true),
      timestamp: Date.now(),
    });

    const latlng =
      this.options.snappingEnabled && this.options.snappingLatlng
        ? this.options.snappingLatlng
        : event.latlng;

    // CRITICAL: Validate coordinates before adding vertex
    // During map transitions, coordinates can become NaN
    if (!latlng || isNaN(latlng.lat) || isNaN(latlng.lng)) {
      console.warn(
        "[measure-path] BLOCKING addVertex with invalid coordinates:",
        latlng
      );
      return; // Don't add invalid vertex
    }

    this.options.currentLine.addVertex(latlng);

    const tooltip = document.querySelector(
      ".leaflet-draw-tooltip"
    ) as HTMLElement;

    const pos = map.latLngToLayerPoint(latlng);
    DomUtil.setPosition(tooltip, pos);

    this._toggleMeasure(
      "img_plg_lines",
      "icon_lineActive",
      "icon_lineInactive"
    );
  },

  startDrawing: function (this: MeasureControl) {
    this.options.startDrawing = true;
  },

  saveShapeHandler: function (
    this: MeasureControl,
    layer: MeasurementPolyline,
    distance: string | null = null,
    area: string | null = null,
    map: LeafletMap
  ) {
    const latlngs = layer.getLatLngs();
    const latlngsJSON = layer.toGeoJSON();
    const shapeId = layer._leaflet_id;
    layer.customID = shapeId;
    console.log("[measure-path] layer click handler added", shapeId);
    layer.on("click", (e) => {
      // If we are snapped and in measurement mode (and not currently drawing),
      // we want to start a new measurement snapped to this point, NOT select the shape.
      // Leaflet event propagation will handle the map click to start drawing.
      if (
        this.options.snappingLatlng &&
        this.options.measurementMode === "measurement" &&
        !this.options.isDrawing
      ) {
        console.debug(
          "[measure-path] Click on shape ignored (snapping active) - letting map click handle it"
        );
        return;
      }

      this.options.cbSetActiveShape(layer.customID);
      this.options.cbSetUpdateStatusHandler(false);
    });

    if (this.options.shapeMode === "polygon") {
      const polygon = this.replaceLineToPolygon(map, layer);
      this.options.cbSaveShape(polygon);
      this.getVisibleShapeIdsArr(map);
    } else {
      const prepareCoordinates =
        this.options.shapeMode === "line"
          ? latlngsJSON.geometry.coordinates
          : latlngsJSON.geometry.coordinates[0];
      const reversedCoordinates = prepareCoordinates.map((item) => {
        return item.reverse();
      });

      const preparePolygon = {
        coordinates: reversedCoordinates,
        options: {
          color: "#267bdcd4",
          fillColor: null,
          opacity: 0.5,
          weight: 4,
        },
        shapeId,
        distance,
        number: this.options.measurementOrder,
        area,
        shapeType: this.options.shapeMode,
      };
      this.options.cbSaveShape(preparePolygon);
      this.getVisibleShapeIdsArr(map);
    }
  },

  _onPolylineDrag: function (this: MeasureControl, event: LeafletEvent) {
    if (this.options.customTooltip) {
      this.options.customTooltip.style.visibility = "hidden";
    }
    this.options.cbSetUpdateStatusHandler(true);

    // Set status based on drag type
    if (this.options.cbSetMapStatus) {
      if (
        event.type === "editable:drag" ||
        event.type === "editable:dragstart"
      ) {
        // Dragging whole shape
        this.options.cbSetMapStatus("MOVING");
      } else if (event.type === "editable:vertex:drag") {
        // Dragging vertices or deleting vertex
        this.options.cbSetMapStatus("EDITING");
      }
    }

    const polyline = event.target;
    const layer = event.layer;
    this.options.cbSetActiveShape(layer.customID);
    const latlngsJSON = layer.toGeoJSON();
    const isLine = layer.toGeoJSON().geometry.type === "LineString";
    const prepareCoordinates = isLine
      ? latlngsJSON.geometry.coordinates
      : latlngsJSON.geometry.coordinates[0];
    const reversedCoordinates = prepareCoordinates.map((item) => {
      return item.reverse();
    });

    const square = !isLine ? calculateArea(reversedCoordinates) : null;
    polyline.updateMeasurements();
    const newDistance = updateDistance(layer);
    const shapeId = polyline?.customID
      ? polyline?.customID
      : polyline._leaflet_id;

    this.options.cbUpdateShape(
      shapeId,
      reversedCoordinates,
      newDistance,
      square
    );
    this.options.isDrawing = false;
  },

  _onPolygonClick: function (
    this: MeasureControl,
    map: LeafletMap,
    event: LeafletMouseEvent
  ) {
    const clickedPolygon = event.target;
    const latlngs = clickedPolygon.getLatLngs();

    this._measureLayers.removeLayer(clickedPolygon._leaflet_id);
    const shapeId = clickedPolygon?.customID
      ? clickedPolygon?.customID
      : clickedPolygon._leaflet_id;

    this.options.cbDeleteShape(shapeId, this.options.localShapeStore);

    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
  },

  onAdd: function (this: MeasureControl, map: LeafletMap) {
    const linesContainer = DomUtil.create(
      "div",
      "leaflet-bar leaflet-control dont-show m-container"
    );
    const lineIcon = DomUtil.create("a", "", linesContainer);
    lineIcon.innerHTML = `
    <div class="measure_icon_wrapper">
      <img id="img_plg_lines" class='mesure_icon' src="${this.options.icon_lineInactive}" alt="Ruler Icon">
    </div>
  `;
    lineIcon.href = "#";
    lineIcon.title = TOOLTIP_LABELS.general.measurementMode;

    const iconsWrapper = DomUtil.create("div", "m-icons-wrapper");
    iconsWrapper.appendChild(linesContainer);

    console.log("[measure-path] icon click handler added");

    DomEvent.on(
      lineIcon,
      "click",
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.toggleMeasurementMode();
      },
      this
    );

    this._map = map;

    this._measureLayers = layerGroup().addTo(map);

    console.log(
      "[measure-path] map click handler added",
      (this._map as unknown as { _leaflet_id: number })._leaflet_id
    );

    // Store handler references for proper cleanup
    this._mapClickHandler = (event) => {
      const enabled = this.options.enabled;

      console.log("[measure-path] Map clicked", this.options, {
        isDrawing: this.options.isDrawing,
        enabled,
        clickAfterShapeSelection: this.options.clickAfterShapeSelection,
        isFinishingShape: (this as any)._isFinishingShape,
        eventType: event.originalEvent?.type,
        isSyntheticSnap: !!(event as any)._isSyntheticSnap,
        targetClassName: (event.originalEvent?.target as HTMLElement)
          ?.className,
        latlng: event.latlng,
        timestamp: Date.now(),
      });

      // Don't start new measurement if we're finishing one
      if ((this as any)._isFinishingShape) {
        console.log(
          "[measure-path] Ignoring map click - currently finishing shape"
        );
        // Clear flag immediately so next click works
        (this as any)._isFinishingShape = false;
        return;
      }

      if (!this.options.isDrawing && enabled) {
        this.drawingLines(map, event);
        this.options.isDrawing = true;
      } else {
        // this.options.isDrawing = false;
      }

      if (this.options.clickAfterShapeSelection) {
        this.options.isDrawing = false;
        this.options.clickAfterShapeSelection = false;
      }
    };

    this._drawCreatedHandler = (event) => {
      console.log("[measure-path] ========== draw:created FIRED ==========", {
        layerType: event.layerType,
        vertexCount: event.layer.getLatLngs?.()?.length || 0,
        timestamp: Date.now(),
      });

      // Reset finishing flag since the shape is successfully created
      // CRITICAL: Use setTimeout to ensure _mapClickHandler sees this as TRUE for the current event loop
      // If we reset it synchronously, _mapClickHandler (which runs after this) will think we are done and start a new shape
      setTimeout(() => {
        (this as any)._isFinishingShape = false;
      }, 0);

      this.options.isDrawing = false;
      this.options.isDrawingEmpty = true;

      this.options.cbSetDrawingStatus(false);
      this.options.cbSetDrawingShape(null);

      // Re-enable edit on existing shapes
      this._measureLayers.eachLayer((layer: any) => {
        if (layer.enableEdit) {
          layer.enableEdit();
        }
      });

      const layer = event.layer;
      // layer.on("dblclick", this._onPolygonClick.bind(this, map));

      layer.on("editable:vertex:dragend", () => {
        this.options.cbSetUpdateStatusHandler(false);
        // Reset status to WAITING when vertex editing ends
        if (this.options.cbSetMapStatus) {
          this.options.cbSetMapStatus("WAITING");
        }
      });

      // Reset status to WAITING when drag ends
      layer.on("editable:dragend", () => {
        if (this.options.cbSetMapStatus) {
          this.options.cbSetMapStatus("WAITING");
        }
      });

      // Add style to polygon
      layer.addTo(this._measureLayers).showMeasurements().enableEdit();
      layer.options.draggable = false;

      const distance = updateDistance(layer);

      this.saveShapeHandler(layer, distance, null, map);

      layer.on(
        "editable:drag editable:vertex:drag editable:vertex:deleted editable:dragstart editable:dragend",
        this._onPolylineDrag.bind(this)
      );

      this.options.isDrawing = false;

      this._measureHandler.disable();
    };

    this._drawDrawstartHandler = (event) => {
      console.warn(
        "[measure-path] ========== draw:drawstart FIRED ==========",
        {
          layerType: event.layerType,
          timestamp: Date.now(),
        }
      );

      // Disable edit on existing shapes to remove grab cursors and prevent interaction conflicts
      this._measureLayers.eachLayer((layer: any) => {
        if (layer.disableEdit) {
          layer.disableEdit();
        }
      });

      const mouseActive = Browser.touch && matchMedia("(hover:hover)").matches;
      if (
        mouseActive ||
        event.layerType === "circle" ||
        event.layerType === "rectangle"
      ) {
        event.target.touchExtend.enable();
      } else {
        event.target.touchExtend.disable();
      }
      this.options.cbSaveLastActiveShapeIdBeforeDrawingHandler();
      this.options.measurementOrder = this.options.measurementOrder + 1;
      this.changeColorByActivePolyline(map, "ddfsc1231");
    };

    // Create vertex click handler once and attach to map (event delegation)
    // This handler listens to ALL map clicks but only processes clicks on vertex markers
    if (!this._vertexClickHandler) {
      // Initialize flag to track when we're finishing a shape
      (this as any)._isFinishingShape = false;

      this._vertexClickHandler = createVertexClickHandler(
        () => this._measureHandler,
        this.options as any,
        () => this._measureHandler?._markers?.length || 0,
        map,
        () => (this as any)._isFinishingShape,
        (value: boolean) => {
          (this as any)._isFinishingShape = value;
        },
        () => (this as any)._lastVertexAdded || 0
      );
      // Handler is now attached to individual markers in _drawDrawvertexHandler
      // to ensure we can stop propagation before it reaches the map
      // map.on("click", this._vertexClickHandler);
      console.log(
        "[measure-path] Created vertex handler (will attach to markers)"
      );
    }

    this._drawDrawvertexHandler = (event) => {
      const layers = event.layers;
      const latlngs = [];
      let index = 0;
      let firsHovering = false;

      layers.eachLayer((layer) => {
        const markerLatLng = layer.getLatLng();
        layer.customHandle = index++;

        // Leaflet.Draw attaches _finishShape click handlers DURING this event
        // We need to remove them AFTER the event completes
        setTimeout(() => {
          const layerEvents = (layer as any)._events;
          if (layerEvents) {
            console.log("[measure-path] Marker listeners before cleanup:", {
              handle: layer.customHandle,
              hasClick: !!layerEvents.click,
              clickCount: layerEvents.click?.length || 0,
              hasTouchend: !!layerEvents.touchend,
              touchendCount: layerEvents.touchend?.length || 0,
            });

            // Remove Leaflet.Draw's _finishShape handler
            // Source: leaflet.draw-src.js line 856, 1129
            layer.off(
              "click",
              (this._measureHandler as any)._finishShape,
              this._measureHandler
            );
            layer.off(
              "dblclick",
              (this._measureHandler as any)._finishShape,
              this._measureHandler
            );

            // Attach our custom handler to the marker
            // This handler MUST stop propagation to prevent the map from seeing the click
            layer.on("click", this._vertexClickHandler);

            // CRITICAL: Stop native touchstart propagation on the DOM element
            // Leaflet.Draw listens to 'touchstart' on the map container to add vertices.
            // We must stop the event at the marker icon DOM level to prevent it from bubbling to the map.
            // layer.on('touchstart') is too late because it's a Leaflet event, not a native DOM capture.
            const icon = layer.getElement();
            if (icon) {
              L.DomEvent.on(icon, "touchstart", L.DomEvent.stopPropagation);
              L.DomEvent.on(icon, "touchend", L.DomEvent.stopPropagation);
              L.DomEvent.on(icon, "touchmove", L.DomEvent.stopPropagation);
              console.log(
                "[measure-path] Added native touch blockers to marker icon"
              );
            }

            // Also stop Leaflet-level touchstart just in case
            layer.on("touchstart", (e) => {
              if (e.originalEvent) {
                L.DomEvent.stopPropagation(e.originalEvent);
              }
            });

            // We don't want to remove 'touchstart' listener we just added, so only remove touchend
            layer.off("touchend");
            // layer.off("touchstart"); // Don't remove this, we just added our own!

            console.log("[measure-path] Removed Leaflet.Draw marker listeners");
          }
        }, 0);

        layer.on("mouseover", (e) => {
          const coordinates = (this._measureHandler as L.Control.DrawHandler)
            ._poly._latlngs;
          const latLngArray = coordinates.map((c) => [c.lat, c.lng]);
          latLngArray.push(latLngArray[0]);
          const area = calculateArea(latLngArray);
          if (e.target.customHandle === 0 && firsHovering) {
            this.options.cbUpdateAreaOfDrawingMeasurement(area);
            L.drawLocal.draw.handlers.polyline.tooltip.end =
              TOOLTIP_LABELS.measurement.finishPolygon;
          }
          firsHovering = true;
        });

        layer.on("mouseout", (e) => {
          if (e.target.customHandle === 0) {
            const tooltipContent = `${TOOLTIP_LABELS.measurement.finishLine}<br>${TOOLTIP_LABELS.measurement.finishPolygon}`;
            L.drawLocal.draw.handlers.polyline.tooltip.end = tooltipContent;
            this.options.cbUpdateAreaOfDrawingMeasurement(null);
          }
        });

        const latLng = layer.getLatLng();
        latlngs.push(latLng);

        // Add mouseover/mouseout for last vertex to show finish tooltip
        // Only when hovering over the last marker, not unconditionally
        layer.on("mouseover", (e) => {
          const isLastVertex = e.target.customHandle === index;
          if (isLastVertex && index >= 1) {
            if (index >= 2) {
              L.drawLocal.draw.handlers.polyline.tooltip.end =
                TOOLTIP_LABELS.measurement.finishPolygonHover;
            } else {
              L.drawLocal.draw.handlers.polyline.tooltip.end =
                TOOLTIP_LABELS.measurement.finishLineHover;
            }
          }
        });

        layer.on("mouseout", (e) => {
          const isLastVertex = e.target.customHandle === index;
          if (isLastVertex && index >= 1) {
            // Reset to default tooltip
            L.drawLocal.draw.handlers.polyline.tooltip.end = `${TOOLTIP_LABELS.measurement.finishLine}<br>${TOOLTIP_LABELS.measurement.finishPolygon}`;
          }
        });
      });

      const formatPerimeter = calculateDistance(latlngs);
      const distance = formatDistance(formatPerimeter);

      if (this.options.isDrawingEmpty) {
        const shapesObj = {
          coordinates: [latlngs],
          distance,
          shapeId: DRAWING_SHAPE_ID,
          number: this.options.measurementOrder,
          shapeType: "line" as const,
          options: {
            color: "#267bdcd4",
            fillColor: null,
            opacity: 0.5,
            weight: 3,
          },
        };

        this.options.isDrawingEmpty = false;
        this.options.cbSetDrawingStatus(true);
        // this.options.cbSaveShape(shapesObj);
        this.options.cbSetDrawingShape(shapesObj);
      } else {
        const shapesObj = {
          coordinates: [latlngs],
          distance,
          shapeId: DRAWING_SHAPE_ID,
          shapeType: "line" as const,
          number: this.options.measurementOrder,
          options: {
            color: "#267bdcd4",
            fillColor: null,
            opacity: 0.5,
            weight: 3,
          },
        };
        this.options.cbSetDrawingShape(shapesObj);
      }
    };

    this._drawCanceledHandler = () => {
      this.options.isDrawing = true;
      this.options.cbSetDrawingStatus(false);

      this._measureHandler.disable();

      // Re-enable edit on existing shapes
      this._measureLayers.eachLayer((layer: any) => {
        if (layer.enableEdit) {
          layer.enableEdit();
        }
      });

      this._toggleMeasure(
        "img_plg_lines",
        "icon_lineActive",
        "icon_lineInactive"
      );

      this.options.cbDeleteVisibleShapeById(DRAWING_SHAPE_ID);
      this.options.cbChangeActiveCancelledShapeId();
    };

    this._moveendHandler = (event) => {
      const allPolyLines = this.getVisiblePolylines(map);
      this.getVisiblePolylinesIds(allPolyLines);
      this.options.cbMapMovingEndHandler(true);
      this.options.cbSetUpdateStatusHandler(false);
    };

    this._mousemoveHandler = (event) => {
      const target = event.originalEvent.target;
      const isDesktop = this.options.device === "Desktop" ? true : false;
      const enabled = this.options.enabled;
      // this._propagateEventToUnderlyingLayers(map, event, "mouseover");

      if (isDesktop) {
        if (!this.options.customTooltip && enabled) {
          const popupPane = map._panes.popupPane;

          this.options.customTooltip = DomUtil.create(
            "div",
            "leaflet-draw-custom-tooltip",
            popupPane
          );

          this.options.customTooltip.innerHTML = `<div>${TOOLTIP_LABELS.measurement.start}</div>`;
          this.options.customTooltip.style.visibility = "inherit";

          const pos = this._map.latLngToLayerPoint(event.latlng);
          DomUtil.setPosition(this.options.customTooltip, pos);
        }

        if (this.options.customTooltip && enabled) {
          const latlng =
            this.options.snappingEnabled && this.options.snappingLatlng
              ? this.options.snappingLatlng
              : event.latlng;

          const pos = this._map.latLngToLayerPoint(latlng);
          // const offsetX = 20;
          const offsetX = 0;
          // DomUtil.setPosition(this.options.customTooltip, pos);
          DomUtil.setPosition(
            this.options.customTooltip,
            point(pos.x + offsetX, pos.y)
          );
          if ((target as HTMLElement).classList.contains("leaflet-div-icon")) {
            this.options.customTooltip.style.visibility = "hidden";
          }
          if (
            ((target as HTMLElement).classList.contains("leaflet-container") ||
              (target as HTMLElement).classList.contains("leaflet-gl-layer")) &&
            this.options.isDrawingEmpty
          ) {
            this.options.customTooltip.style.visibility = "visible";
          }
        }
      }
    };

    this._mouseoutHandler = (event) => {
      if (this.options.customTooltip) {
        this.options.customTooltip.style.visibility = "hidden";
      }
    };

    map.on("click", this._mapClickHandler);
    map.on("draw:created", this._drawCreatedHandler);
    map.on("draw:drawstart", this._drawDrawstartHandler);
    map.on("draw:drawvertex", this._drawDrawvertexHandler);
    map.on("draw:canceled", this._drawCanceledHandler);
    map.on("moveend", this._moveendHandler);
    map.on("mousemove", this._mousemoveHandler);
    map.on("mouseout", this._mouseoutHandler);

    return iconsWrapper;
  },

  onRemove: function (this: MeasureControl, map: LeafletMap) {
    // Clean up all event handlers to prevent memory leaks and duplicate handlers on HMR
    console.log("[measure-path] onRemove: Cleaning up event handlers");

    // Remove only OUR specific event handlers by reference
    if (this._mapClickHandler) map.off("click", this._mapClickHandler);
    if (this._drawCreatedHandler)
      map.off("draw:created", this._drawCreatedHandler);
    if (this._drawDrawstartHandler)
      map.off("draw:drawstart", this._drawDrawstartHandler);
    if (this._drawDrawvertexHandler)
      map.off("draw:drawvertex", this._drawDrawvertexHandler);
    if (this._drawCanceledHandler)
      map.off("draw:canceled", this._drawCanceledHandler);
    if (this._moveendHandler) map.off("moveend", this._moveendHandler);
    if (this._mousemoveHandler) map.off("mousemove", this._mousemoveHandler);
    if (this._mouseoutHandler) map.off("mouseout", this._mouseoutHandler);

    // Vertex click handler is attached to markers, which are removed automatically
    // if (this._vertexClickHandler) {
    //   map.off("click", this._vertexClickHandler);
    // }

    // Remove measure layers
    if (this._measureLayers) {
      this._measureLayers.clearLayers();
      map.removeLayer(this._measureLayers);
    }

    // Disable active drawing handler
    if (this._measureHandler) {
      this._measureHandler.disable();
    }
  },

  _UpdateAreaperimeter: function (this: MeasureControl, layer: any) {
    const latlngs = layer.getLatLngs()[0];

    const options = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
  },

  _toggleMeasure: function (
    this: MeasureControl,
    btnId = "",
    activeIcon = "",
    inactiveIcon = ""
  ) {
    if (this.options.isDrawing) {
      this.options.isDrawing = false;
    } else {
      this._measureHandler.enable();
    }
  },

  _clearMeasurements: function (this: MeasureControl) {
    this._measureLayers.clearLayers();
  },

  changeColorByActivePolyline: function (
    this: MeasureControl,
    map: LeafletMap,
    customID: string
  ) {
    this._measureLayers.eachLayer(function (layer) {
      const polyline = layer as unknown as MeasurementPolyline;
      if (layer instanceof Polyline) {
        if ((layer as unknown as MeasurementPolyline).customID === customID) {
          (polyline as MeasurementPolyline)._path.classList.remove(
            "custom-polyline"
          );
          (polyline as MeasurementPolyline).enableEdit();
        } else {
          (polyline as MeasurementPolyline)._path.classList.add(
            "custom-polyline"
          );
          (polyline as MeasurementPolyline).disableEdit();
        }
      }
    });
  },

  changeColorByLastShape: function (this: MeasureControl, map: LeafletMap) {
    let lastPolyline = null;

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof Polyline) {
        lastPolyline = layer;
        layer._path.classList.add("custom-polyline");
      }
    });

    if (lastPolyline) {
      lastPolyline._path.classList.remove("custom-polyline");
    }
  },

  getVisiblePolylines: function (this: MeasureControl, map: LeafletMap) {
    const visiblePolylines = [];
    const mapBounds = map.getBounds();

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof Polyline) {
        if (mapBounds.intersects(layer.getBounds())) {
          visiblePolylines.push(layer);
        }
      }
    });

    return visiblePolylines;
  },

  getVisiblePolylinesIds: function (this: MeasureControl, polylinesArr: any[]) {
    const idsPolylinesArr = [];
    this.options.visiblePolylines = [];
    polylinesArr.forEach((m) => {
      idsPolylinesArr.push(m.customID);
      this.options.visiblePolylines.push(m.customID);
    });

    this.options.cbVisiblePolylinesChange(idsPolylinesArr);
  },

  getAllPolylines: function (this: MeasureControl, map: LeafletMap) {
    const polylines = [];

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof Polyline) {
        polylines.push(layer);
      }
    });

    return polylines;
  },

  removePolylineById: function (
    this: MeasureControl,
    map: LeafletMap,
    customID: string
  ) {
    const self = this;
    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof Polyline && layer.customID === customID) {
        self._measureLayers.removeLayer(layer);
      }
    });
  },

  showActiveShape: function (
    this: MeasureControl,
    map: LeafletMap,
    coordinates: any
  ) {
    this.options.moveToShape = true;
    const bounds = latLngBounds(coordinates as L.LatLngExpression[]);
    map.fitBounds(bounds);
  },

  fitMapToPolylines: function (
    this: MeasureControl,
    map: LeafletMap,
    polylines: any[]
  ) {
    if (polylines.length === 0) {
      return;
    }

    const allBounds = latLngBounds(
      polylines[0].getBounds().getNorthEast(),
      polylines[0].getBounds().getSouthWest()
    );

    polylines.forEach((polyline) => {
      const polylineBounds = polyline.getBounds();
      allBounds.extend(polylineBounds);
    });

    map.fitBounds(allBounds);
  },

  replaceLineToPolygon: function (
    this: MeasureControl,
    map: LeafletMap,
    layer: any
  ) {
    const latlngsJSON = layer.toGeoJSON();
    const prepareCoordinates = latlngsJSON.geometry.coordinates.map((l) => {
      return l.reverse();
    });

    map.removeLayer(layer);

    prepareCoordinates.push(prepareCoordinates[0]);

    const options = {
      color: "#267bdcd4",
      fillColor: "#267bdcd4",
      opacity: 1,
      weight: 3,
    };
    const distance = updateDistanceByLatLngs(prepareCoordinates);
    const square = calculateArea(prepareCoordinates);
    const preparePolygon = {
      coordinates: prepareCoordinates,
      options,
      shapeId: layer.customID,
      distance: distance,
      number: this.options.measurementOrder,
      area: square,
      shapeType: this.options.shapeMode,
    };

    const polygonLayer = polygon(prepareCoordinates, options);

    polygonLayer.customID = layer.customID;
    polygonLayer.customShape = "polygon";

    polygonLayer.addTo(this._measureLayers).showMeasurements().enableEdit();
    // polygonLayer.on("dblclick", this._onPolygonClick.bind(this, map));
    polygonLayer.on("click", () => {
      this.options.cbSetActiveShape(polygonLayer.customID);
      this.options.cbSetUpdateStatusHandler(false);
      this.options.isDrawing = false;
    });
    polygonLayer.on(
      "editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted",
      this._onPolylineDrag.bind(this)
    );

    polygonLayer.on("editable:vertex:dragend", () => {
      this.options.cbSetUpdateStatusHandler(false);
      // Reset status to WAITING when vertex editing ends
      if (this.options.cbSetMapStatus) {
        this.options.cbSetMapStatus("WAITING");
      }
    });

    // Reset status to WAITING when drag ends
    polygonLayer.on("editable:dragend", () => {
      if (this.options.cbSetMapStatus) {
        this.options.cbSetMapStatus("WAITING");
      }
    });

    this.options.polygonMode = false;

    this.options.isDrawing = true;

    this._toggleMeasure(
      "img_plg_lines",
      "icon_lineActive",
      "icon_lineInactive"
    );

    // this.options.isDrawing = false;

    // this._measureHandler.disable();

    return preparePolygon;
  },
  getVisibleShapeIdsArr: function (this: MeasureControl, map: LeafletMap) {
    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
    return this.options.visiblePolylines;
  },

  findLastCreatedLayer: function (this: MeasureControl, layerGroup: any) {
    let lastLayer = null;
    let highestId = -1;

    layerGroup.eachLayer((layer) => {
      if (layer._leaflet_id > highestId) {
        highestId = layer._leaflet_id;
        lastLayer = layer;
      }
    });

    return lastLayer;
  },

  loadMeasurements: function (this: MeasureControl, map?: LeafletMap) {
    if (this.options.shapes.length !== 0) {
      this.options.shapes.forEach((shape) => {
        const { coordinates, options, shapeId, shapeType } = shape;

        const savedShape =
          shapeType === "line"
            ? polyline(
                coordinates as any,
                {
                  showLength: true,
                  className: "custom-polyline",
                  shapeOptions: {
                    weight: 4,
                    color: "#267bdcd4",
                    opacity: 1,
                  },
                } as any
              )
            : polygon(
                coordinates as any,
                {
                  showLength: true,
                  className: "custom-polyline",
                  shapeOptions: {
                    weight: 4,
                    color: "#267bdcd4",
                    opacity: 1,
                  },
                } as any
              );

        (savedShape as any).customID = shapeId;
        savedShape.addTo(this._measureLayers).showMeasurements().enableEdit();
        savedShape.on("click", () => {
          this.options.isDrawing = true;
          this.options.cbSetActiveShape(savedShape.customID);
          this.options.cbSetUpdateStatusHandler(false);
          this.options.clickAfterShapeSelection = true;
        });
        savedShape.on("mouseout", (e) => {
          // this.options.isDrawing = false;
        });
        savedShape.on("mouseover", (e) => {
          if (this.options.customTooltip) {
            this.options.customTooltip.style.visibility = "hidden";
          }
        });
        savedShape.on(
          "editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted",
          this._onPolylineDrag.bind(this)
        );

        savedShape.on("editable:vertex:dragend", () => {
          this.options.cbSetUpdateStatusHandler(false);
          // Reset status to WAITING when vertex editing ends
          if (this.options.cbSetMapStatus) {
            this.options.cbSetMapStatus("WAITING");
          }
        });

        // Reset status to WAITING when drag ends
        savedShape.on("editable:dragend", () => {
          if (this.options.cbSetMapStatus) {
            this.options.cbSetMapStatus("WAITING");
          }
        });
      });
    }
  },

  _toggleMeasurementBtn: function (this: MeasureControl) {
    if (this.options.changeModeButtonActive) {
      (document.getElementById("img_plg_lines") as HTMLImageElement).src =
        this.options.icon_lineInactive;
      this.options.changeModeButtonActive = false;
    } else {
      (document.getElementById("img_plg_lines") as HTMLImageElement).src =
        this.options.icon_lineActive;
      this.options.changeModeButtonActive = true;
    }
  },

  toggleMeasurementMode: function (
    this: MeasureControl,
    ifChangeMode = true,
    map?: LeafletMap
  ) {
    const enabled = this.options.enabled;
    if (enabled) {
      L.drawLocal.draw.handlers.polyline.tooltip.start =
        TOOLTIP_LABELS.measurement.start;
      this._clearMeasurements();
      this.loadMeasurements();
      // const drawBtn = document.getElementById("draw_shape");
      // drawBtn.classList.remove("hide-draw-btn");

      (document.getElementById("img_plg_lines") as HTMLImageElement).src =
        this.options.icon_lineActive;

      // if (this.options.isFirstLoading) {
      //   this.options.isFirstLoading = false;
      // }

      const customTooltip = document.querySelector("#routedMap") as HTMLElement;
      customTooltip.style.cursor = "crosshair";
    } else {
      this._clearMeasurements();

      const customTooltip = document.querySelector("#routedMap") as HTMLElement;
      customTooltip.style.cursor = "pointer";
      if (this.options.currentLine) {
        this.options.currentLine.disable();
      }
      customTooltip.style.cursor = "pointer";
      // const drawBtn = document.getElementById("draw_shape");
      // drawBtn.classList.add("hide-draw-btn");
      this.options.isDrawing = false;
      (document.getElementById("img_plg_lines") as HTMLImageElement).src =
        this.options.icon_lineInactive;
    }

    if (ifChangeMode) {
      this.options.cbToggleMeasurementMode();
    }
  },

  setMeasurementEnabled: function (
    this: MeasureControl,
    enabled: boolean,
    map: LeafletMap
  ) {
    this.options.enabled = enabled;
    this.toggleMeasurementMode(false, map);
  },
  changeMeasurementsArr: function (this: MeasureControl, arr: any[]) {
    this.options.shapes = arr;
  },
  cancelDrawing: function (this: MeasureControl) {
    if (!this.options.isDrawingEmpty) {
      this._measureHandler.disable();
      this.options.isDrawingEmpty = true;

      this._measureLayers.clearLayers();

      this.options.cbSetDrawingStatus(false);
      this.options.cbDeleteVisibleShapeById(DRAWING_SHAPE_ID);
      // this.options.isDrawing = true;
    }
  },
});

// Adds the method to create a new instance of the control
(L.Control as any).MeasureControl = MeasureControl;
(L.control as any).measureControl = function (options: any) {
  return new MeasureControl(options);
};
