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
} from "./measurement-geometry";
import { createVertexClickHandler } from "./vertex-click-handler";
import {
  MeasurementPolyline,
  MeasurementPolygon,
  MeasurementLayer,
  MeasurementLeafletEvent,
  MeasurePolygonControl,
} from "../types/leaflet-extensions";

export const MeasurePolygon = Control.extend({
  options: {
    position: "topright",
    icon_lineActive: "https://img.icons8.com/?size=48&id=98497&format=png",
    icon_lineInactive: "https://img.icons8.com/?size=48&id=98463&format=png",
    icon_polygonActive: "https://img.icons8.com/?size=48&id=98497&format=png",
    icon_polygonInactive: "https://img.icons8.com/?size=48&id=98463&format=png",
    html_template: `<p><strong><span style="text-decoration: underline;">Results</span></strong></p>
<p><strong>Area: </strong><br>_p_area</p>
<p><strong>Perimeter : </strong><br>_p_perimeter</p>`,
    height: 130,
    width: 150,
    mode_btn: "",
    color_polygon: "black",
    fillColor_polygon: "yellow",
    weight_polygon: "2",
    isDrawing: false,
    changeModeButtonActive: false,
    msj_disable_tool: "Möchten Sie das Tool deaktivieren?",
    shapes: [],
    activeShape: null,
    shapeMode: "line",
    measurementOrder: 0,
    moveToShape: false,
    cb: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSaveShape: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cdDeleteShape: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbUpdateShape: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbVisiblePolylinesChange: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetDrawingStatus: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetDrawingShape: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetActiveShape: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetUpdateStatusHandler: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbMapMovingEndHandler: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSaveLastActiveShapeIdBeforeDrawingHandler: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbChangeActiveCanceldShapeId: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbToggleMeasurementMode: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbGetMeasurementModeHandler: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbDeleteVisibleShapeById: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbUpdateAreaOfDrawingMeasurement: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetCurrentDrawHandler: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    cbSetMapStatus: function (...args: any[]) {
      console.debug("Callback function executed!", args);
    },
    visiblePolylines: [],
    localShapeStore: [],
    isDrawingEmpty: true,
    nativeMove: false,
    currenLine: null,
    polygonMode: false,
    measurementMode: false as string | boolean,
    startDrawing: false,
    customTooltip: null,
    device: null,
    clickAfterShapeSelection: false,
    snappingLatlng: null,
    snappingEnabled: true,
  },

  drawingLines: function (
    this: MeasurePolygonControl,
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
        console.log("[measure-path] addVertex() called", {
          latlng,
          currentVertexCount: this._markers?.length || 0,
          timestamp: Date.now(),
        });
        (self as any)._lastVertexAdded = Date.now();
        return originalAddVertex.apply(this, arguments);
      };
    }

    this.options.currenLine = this._measureHandler;
    this.options.cbSetCurrentDrawHandler(this._measureHandler);

    const tooltipContent = `
  <div>
    <div>Zum Beenden auf den letzten angelegten Punkt klicken.</div>
    <div>Zum Messen einer Fläche auf den ersten angelegten Punkt klicken und die Fläche so schließen.</div>
  </div>
`;

    L.drawLocal.draw.handlers.polyline.tooltip.start =
      "Klicken, um den Startpunkt der Messung zu setzen.";
    L.drawLocal.draw.handlers.polyline.tooltip.cont =
      "Klicken (ggf. mehrmals), um die nächsten Punkte des Linienzuges zu setzen.";
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

    this.options.currenLine.addVertex(latlng);

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

  startDrawing: function (this: MeasurePolygonControl) {
    this.options.startDrawing = true;
  },

  saveShapeHandler: function (
    this: MeasurePolygonControl,
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

  _onPolylineDrag: function (this: MeasurePolygonControl, event: LeafletEvent) {
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
    this: MeasurePolygonControl,
    map: LeafletMap,
    event: LeafletMouseEvent
  ) {
    const clickedPolygon = event.target;
    const latlngs = clickedPolygon.getLatLngs();

    this._measureLayers.removeLayer(clickedPolygon._leaflet_id);
    const shapeId = clickedPolygon?.customID
      ? clickedPolygon?.customID
      : clickedPolygon._leaflet_id;

    this.options.cdDeleteShape(shapeId, this.options.localShapeStore);

    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
  },

  onAdd: function (this: MeasurePolygonControl, map: LeafletMap) {
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
    lineIcon.title = "Messmodus";

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
      const mode = this.options.measurementMode;

      console.log("[measure-path] Map clicked", {
        isDrawing: this.options.isDrawing,
        mode,
        clickAfterShapeSelection: this.options.clickAfterShapeSelection,
        isFinishingShape: (this as any)._isFinishingShape,
        eventType: event.originalEvent?.type,
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

      if (!this.options.isDrawing && mode === "measurement") {
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
      console.warn("[measure-path] ========== draw:created FIRED ==========", {
        stack: new Error().stack,
        layerType: event.layerType,
        vertexCount: event.layer.getLatLngs?.()?.length || 0,
        timestamp: Date.now(),
      });

      // Reset finishing flag since the shape is successfully created
      (this as any)._isFinishingShape = false;

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
            L.drawLocal.draw.handlers.polyline.tooltip.end = `Den Startpunkt anklicken, um die Fläche zu schließen.`;
          }
          firsHovering = true;
        });

        layer.on("mouseout", (e) => {
          if (e.target.customHandle === 0) {
            const tooltipContent = `
            <div>
              <div>Zum Beenden auf den letzten angelegten Punkt klicken.</div>
              <div>Zum Messen einer Fläche auf den ersten angelegten Punkt klicken und die Fläche so schließen.</div>
            </div>
          `;
            L.drawLocal.draw.handlers.polyline.tooltip.end = tooltipContent;
            this.options.cbUpdateAreaOfDrawingMeasurement(null);
          }
        });

        const latLng = layer.getLatLng();
        latlngs.push(latLng);
        if (index === 1) {
          L.drawLocal.draw.handlers.polyline.tooltip.end = `
            <div>Den Endpunkt erneut anklicken,
            </div> <div>um die Streckenmessung zu beenden.</div>`;
        }
        if (index > 2) {
          L.drawLocal.draw.handlers.polyline.tooltip.end = `
            <div>Den Endpunkt erneut anklicken, um die Streckenmessung zu beenden.</div> 
            <div>Zum Messen einer Fläche erneut auf den Startpunkt klicken.</div>`;
        }
      });

      const formatPerimeter = calculateDistance(latlngs);
      const distance = formatDistance(formatPerimeter);

      if (this.options.isDrawingEmpty) {
        const shapesObj = {
          coordinates: [latlngs],
          distance,
          shapeId: 5555,
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
          shapeId: 5555,
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

      this.options.cbDeleteVisibleShapeById(5555);
      this.options.cbChangeActiveCanceldShapeId();
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
      const mode = this.options.measurementMode;
      // this._propagateEventToUnderlyingLayers(map, event, "mouseover");

      if (isDesktop) {
        if (!this.options.customTooltip && mode === "measurement") {
          const popupPane = map._panes.popupPane;

          this.options.customTooltip = DomUtil.create(
            "div",
            "leaflet-draw-custom-tooltip",
            popupPane
          );

          this.options.customTooltip.innerHTML = `<div>Klicken, um den Startpunkt der Messung zu setzen.</div>`;
          this.options.customTooltip.style.visibility = "inherit";

          const pos = this._map.latLngToLayerPoint(event.latlng);
          DomUtil.setPosition(this.options.customTooltip, pos);
        }

        if (this.options.customTooltip && mode === "measurement") {
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

  onRemove: function (this: MeasurePolygonControl, map: LeafletMap) {
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

  _UpdateAreaperimeter: function (this: MeasurePolygonControl, layer: any) {
    const latlngs = layer.getLatLngs()[0];

    const options = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
  },

  _toggleMeasure: function (
    this: MeasurePolygonControl,
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

  _clearMeasurements: function (this: MeasurePolygonControl) {
    this._measureLayers.clearLayers();
  },

  changeColorByActivePolyline: function (
    this: MeasurePolygonControl,
    map: LeafletMap,
    customID: string
  ) {
    this._measureLayers.eachLayer(function (layer) {
      const polyline = layer as MeasurementPolyline;
      if (layer instanceof Polyline) {
        if ((layer as MeasurementPolyline).customID === customID) {
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

  changeColorByLastShape: function (
    this: MeasurePolygonControl,
    map: LeafletMap
  ) {
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

  getVisiblePolylines: function (this: MeasurePolygonControl, map: LeafletMap) {
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

  getVisiblePolylinesIds: function (
    this: MeasurePolygonControl,
    polylinesArr: any[]
  ) {
    const idsPolylinesArr = [];
    this.options.visiblePolylines = [];
    polylinesArr.forEach((m) => {
      idsPolylinesArr.push(m.customID);
      this.options.visiblePolylines.push(m.customID);
    });

    this.options.cbVisiblePolylinesChange(idsPolylinesArr);
  },

  getAllPolylines: function (this: MeasurePolygonControl, map: LeafletMap) {
    const polylines = [];

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof Polyline) {
        polylines.push(layer);
      }
    });

    return polylines;
  },

  removePolylineById: function (
    this: MeasurePolygonControl,
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
    this: MeasurePolygonControl,
    map: LeafletMap,
    coordinates: any
  ) {
    this.options.moveToShape = true;
    const bounds = latLngBounds(coordinates as L.LatLngExpression[]);
    map.fitBounds(bounds);
  },

  fitMapToPolylines: function (
    this: MeasurePolygonControl,
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
    this: MeasurePolygonControl,
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
  getVisibleShapeIdsArr: function (
    this: MeasurePolygonControl,
    map: LeafletMap
  ) {
    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
    return this.options.visiblePolylines;
  },

  findLastCreatedLayer: function (
    this: MeasurePolygonControl,
    layerGroup: any
  ) {
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

  loadMeasurements: function (this: MeasurePolygonControl, map?: LeafletMap) {
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

        savedShape.customID = shapeId;
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

  _toggleMeasurementBtn: function (this: MeasurePolygonControl) {
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
    this: MeasurePolygonControl,
    ifChangeMode = true,
    map?: LeafletMap
  ) {
    const mode = this.options.measurementMode;
    if (mode === "measurement") {
      L.drawLocal.draw.handlers.polyline.tooltip.start =
        "Klicken, um den Startpunkt der Messung zu setzen.";
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
      if (this.options.currenLine) {
        this.options.currenLine.disable();
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

  changeMeasurementMode: function (
    this: MeasurePolygonControl,
    mode: string,
    map: LeafletMap
  ) {
    this.options.measurementMode = mode;
    this.toggleMeasurementMode(false, map);
  },
  changeMeasurementsArr: function (this: MeasurePolygonControl, arr: any[]) {
    this.options.shapes = arr;
  },
  cancelDrawing: function (this: MeasurePolygonControl) {
    if (!this.options.isDrawingEmpty) {
      this._measureHandler.disable();
      this.options.isDrawingEmpty = true;

      this._measureLayers.clearLayers();

      this.options.cbSetDrawingStatus(false);
      this.options.cbDeleteVisibleShapeById(5555);
      // this.options.isDrawing = true;
    }
  },
});

// Adds the method to create a new instance of the control
(L.Control as any).MeasurePolygon = MeasurePolygon;
(L.control as any).measurePolygon = function (options: any) {
  return new MeasurePolygon(options);
};
