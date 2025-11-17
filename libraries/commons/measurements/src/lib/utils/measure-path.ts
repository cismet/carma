// Create a class for the plugin
import L from "leaflet";
import "leaflet-draw";
import "@carma/types";
import {
  calculateArea,
  calculateDistance,
  formatDistance,
  updateDistance,
  updateDistanceByLatLngs,
} from "./measurement-geometry";

// Type augmentation is imported from types/leaflet-extensions.d.ts
// All Leaflet type extensions are centralized there

// @ts-expect-error - Leaflet's extend pattern doesn't match TypeScript's class system
L.Control.MeasurePolygon = L.Control.extend({
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
    cb: function () {
      console.debug("Callback function executed!");
    },
    cbSaveShape: function () {
      console.debug("Callback function executed!");
    },
    cdDeleteShape: function () {
      console.debug("Callback function executed!");
    },
    cbUpdateShape: function () {
      console.debug("Callback function executed!");
    },
    cbVisiblePolylinesChange: function () {
      console.debug("Callback function executed!");
    },
    cbSetDrawingStatus: function () {
      console.debug("Callback function executed!");
    },
    cbSetDrawingShape: function () {
      console.debug("Callback function executed!");
    },
    cbSetActiveShape: function () {
      console.debug("Callback function executed!");
    },
    cbSetUpdateStatusHandler: function () {
      console.debug("Callback function executed!");
    },
    cbMapMovingEndHandler: function () {
      console.debug("Callback function executed!");
    },
    cbSaveLastActiveShapeIdBeforeDrawingHandler: function () {
      console.debug("Callback function executed!");
    },
    cbChangeActiveCanceldShapeId: function () {
      console.debug("Callback function executed!");
    },
    cbToggleMeasurementMode: function () {
      console.debug("Callback function executed!");
    },
    cbGetMeasurementModeHandler: function () {
      console.debug("Callback function executed!");
    },
    cbDeleteVisibleShapeById: function () {
      console.debug("Callback function executed!");
    },
    cbUpdateAreaOfDrawingMeasurement: function () {
      console.debug("Callback function executed!");
    },
    cbSetCurrentDrawHandler: function () {
      console.debug("Callback function executed!");
    },
    visiblePolylines: [],
    localShapeStore: [],
    isDrawingEmpty: true,
    nativeMove: false,
    currenLine: null,
    polygonMode: false,
    measurementMode: false,
    startDrawing: false,
    customTooltip: null,
    device: null,
    clickAfterShapeSelection: false,
    snappingLatlng: null,
    snappingEnabled: true,
  },

  drawingPolygons: function (map) {
    this.options.shapeMode = "polygon";
    this._measureHandler = new L.Draw.Polygon(map as any, {
      showArea: true,
      shapeOptions: {
        color: "#267bdcd4",
        fillColor: null,
        fillOpacity: 0.2,
        stroke: true,
      },
    });

    L.drawLocal.draw.handlers.polygon.tooltip.start =
      "Klicken, um den Startpunkt der Messung zu setzen.";
    L.drawLocal.draw.handlers.polygon.tooltip.cont =
      "Klicken (ggf. mehrmals), um die nächsten Punkte des Linienzuges zu setzen.";
    L.drawLocal.draw.handlers.polygon.tooltip.end = `Zum Beenden auf den letzten angelegt Punkt klicken.
      Zum Messen einer Fläche auf den ersten angeleten.
      Punkt klicken und die Fläche so schließen`;

    this._toggleMeasure(
      "img_plg_measure_polygon",
      "icon_polygonActive",
      "icon_polygonInactive"
    );
  },

  drawingLines: function (map, event) {
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
    L.DomUtil.setPosition(tooltip, pos);

    this._toggleMeasure(
      "img_plg_lines",
      "icon_lineActive",
      "icon_lineInactive"
    );
  },

  startDrawing: function () {
    this.options.startDrawing = true;
  },

  saveShapeHandler: function (layer, distance = null, area = null, map) {
    const latlngs = layer.getLatLngs();
    const latlngsJSON = layer.toGeoJSON();
    const shapeId = layer._leaflet_id;
    layer.customID = shapeId;
    console.log("[measure-path] layer click handler added", shapeId);
    layer.on("click", () => {
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

  _onPolylineDrag: function (event) {
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

  _onPolygonClick: function (map, event) {
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

  onAdd: function (map) {
    const linesContainer = L.DomUtil.create(
      "div",
      "leaflet-bar leaflet-control dont-show m-container"
    );

    // const modeBtn = L.DomUtil.create(
    //   "div",
    //   "leaflet-bar leaflet-control dont-show m-container hide-draw-btn draw-custom-button",
    //   linesContainer,
    // );

    // modeBtn.id = "draw_shape";
    // modeBtn.title = "Flächen- und Umfangsmessungen";

    // modeBtn.innerHTML = this.options.mode_btn;

    const lineIcon = L.DomUtil.create("a", "", linesContainer);
    lineIcon.innerHTML = `
    <div class="measure_icon_wrapper">
      <img id="img_plg_lines" class='mesure_icon' src="${this.options.icon_lineInactive}" alt="Ruler Icon">
    </div>
  `;
    lineIcon.href = "#";
    lineIcon.title = "Messmodus";

    const iconsWrapper = L.DomUtil.create("div", "m-icons-wrapper");
    iconsWrapper.appendChild(linesContainer);

    console.log("[measure-path] icon click handler added");

    L.DomEvent.on(
      lineIcon,
      "click",
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.toggleMeasurementMode();
      },
      this
    );

    this._map = map;

    this._measureLayers = L.layerGroup().addTo(map);

    console.log(
      "[measure-path] map click handler added",
      (this._map as unknown as { _leaflet_id: number })._leaflet_id
    );

    map.on("click", (event) => {
      const mode = this.options.measurementMode;
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
    });

    map.on("draw:created", (event) => {
      console.warn("[measure-path] ========== draw:created FIRED ==========", {
        stack: new Error().stack,
        layerType: event.layerType,
        vertexCount: event.layer.getLatLngs?.()?.length || 0,
        timestamp: Date.now(),
      });

      this.options.isDrawing = false;
      this.options.isDrawingEmpty = true;

      this.options.cbSetDrawingStatus(false);
      this.options.cbSetDrawingShape(null);

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
    });

    map.on("draw:drawstart", (event) => {
      console.warn(
        "[measure-path] ========== draw:drawstart FIRED ==========",
        {
          layerType: event.layerType,
          timestamp: Date.now(),
        }
      );

      const mouseActive =
        L.Browser.touch && matchMedia("(hover:hover)").matches;
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
      const shapesObj = {
        coordinates: [[51.352635, 7.209284]],
        distance: 0,
        shapeId: 5555,
        number: this.options.measurementOrder,
        shapeType: "line",
      };
      this.changeColorByActivePolyline(map, "ddfsc1231");
    });

    map.on("draw:drawvertex", (event) => {
      const layers = event.layers;
      const latlngs = [];
      let index = 0;
      let firsHovering = false;

      layers.eachLayer((layer) => {
        const markerLatLng = layer.getLatLng();
        layer.customHandle = index++;

        // Store reference to the click handler so we can check conditions
        const vertexClickHandler = (e) => {
          // Only process first vertex clicks (for closing polygon)
          if (e.target.customHandle !== 0) {
            return; // Not the first vertex, let Leaflet.Draw handle it normally
          }

          console.warn(
            "[measure-path] ========== Calling completeShape() from vertex click ==========",
            {
              stack: new Error().stack,
              snappingEnabled: this.options.snappingEnabled,
              targetHandle: e.target.customHandle,
              timestamp: Date.now(),
            }
          );
          this.options.shapeMode = "polygon";
          this.options.currenLine.completeShape();
        };

        console.debug("[measure-path] Attaching vertex click handler");
        // Only attach click handler to first vertex (handle 0) to prevent
        // premature completion when clicking/touching other vertices
        if (layer.customHandle === 0) {
          layer.on("click", vertexClickHandler);
        }
        layer.on("mouseover", (e) => {
          const coordinates = (this._measureHandler as L.Control.DrawHandler)
            ._poly._latlngs;
          const latLngArray = coordinates.map((c) => [c.lat, c.lng]);
          latLngArray.push(latLngArray[0]);
          const area = calculateArea(latLngArray);
          // this.options.customTooltip.style.visibility = "hidden";
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
    });

    map.on("draw:canceled", () => {
      this.options.isDrawing = true;
      this.options.cbSetDrawingStatus(false);

      this._measureHandler.disable();

      this._toggleMeasure(
        "img_plg_lines",
        "icon_lineActive",
        "icon_lineInactive"
      );

      this.options.cbDeleteVisibleShapeById(5555);

      this.options.cbChangeActiveCanceldShapeId();
    });

    map.on("moveend", () => {
      const allPolyLines = this.getVisiblePolylines(map);
      this.getVisiblePolylinesIds(allPolyLines);
      this.options.cbMapMovingEndHandler(true);
      this.options.cbSetUpdateStatusHandler(false);
    });

    map.on("mousemove", (event) => {
      const target = event.originalEvent.target;
      const isDesktop = this.options.device === "Desktop" ? true : false;
      const mode = this.options.measurementMode;
      // this._propagateEventToUnderlyingLayers(map, event, "mouseover");

      if (isDesktop) {
        if (!this.options.customTooltip && mode === "measurement") {
          const popupPane = map._panes.popupPane;

          this.options.customTooltip = L.DomUtil.create(
            "div",
            "leaflet-draw-custom-tooltip",
            popupPane
          );

          this.options.customTooltip.innerHTML = `<div>Klicken, um den Startpunkt der Messung zu setzen.</div>`;
          this.options.customTooltip.style.visibility = "inherit";

          const pos = this._map.latLngToLayerPoint(event.latlng);
          L.DomUtil.setPosition(this.options.customTooltip, pos);
        }

        if (this.options.customTooltip && mode === "measurement") {
          const pos = this._map.latLngToLayerPoint(event.latlng);
          // const offsetX = 20;
          const offsetX = 0;
          // L.DomUtil.setPosition(this.options.customTooltip, pos);
          L.DomUtil.setPosition(
            this.options.customTooltip,
            L.point(pos.x + offsetX, pos.y)
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
    });

    map.on("mouseout", (event) => {
      if (this.options.customTooltip) {
        this.options.customTooltip.style.visibility = "hidden";
      }
    });

    return iconsWrapper;
  },

  // _propagateEventToUnderlyingLayers: function (map, event, eventType) {
  //   // Get the lat/lng of the vertex
  //   // const latlng = event.target.getLatLng();
  //   const latlng =
  //     event.target && event.target.getLatLng
  //       ? event.target.getLatLng() // For vertex marker events
  //       : event.latlng; // For map mousemove events

  //   // Convert to container point
  //   const point = map.latLngToContainerPoint(latlng);

  //   // Find all layers at this point (excluding the measurement vertex itself)
  //   const layers = [];
  //   map.eachLayer((layer) => {
  //     // Skip the measurement layers and the current target
  //     if (layer === event.target || layer === this._measureLayers) {
  //       return;
  //     }

  //     // Check if this layer is a GeoJSON or similar feature layer with mouseover handlers
  //     if (
  //       layer.feature &&
  //       layer._events &&
  //       (layer._events.mouseover || layer._events.mouseout)
  //     ) {
  //       let isInside = false;

  //       // For polygon/polyline layers, check if point is inside
  //       if (layer.getBounds) {
  //         const bounds = layer.getBounds();
  //         if (bounds.contains(latlng)) {
  //           // For polygons, do a more precise check using Leaflet's internal method
  //           if (
  //             layer instanceof L.Polygon ||
  //             (layer._latlngs && Array.isArray(layer._latlngs))
  //           ) {
  //             // Use a simple point-in-polygon check
  //             // For now, just use bounds check as a proxy
  //             isInside = true;
  //           } else {
  //             isInside = true;
  //           }
  //         }
  //       } else if (layer.getLatLng) {
  //         // For point markers
  //         isInside = layer.getLatLng().equals(latlng);
  //       }

  //       if (isInside) {
  //         layers.push(layer);
  //       }
  //     }
  //   });

  //   // Fire the event on the underlying layers
  //   layers.forEach((layer) => {
  //     if (eventType === "mouseover" && layer._events.mouseover) {
  //       layer.fire("mouseover", {
  //         latlng: latlng,
  //         layerPoint: point,
  //         containerPoint: point,
  //         originalEvent: event.originalEvent,
  //         target: layer,
  //       });
  //     } else if (eventType === "mouseout" && layer._events.mouseout) {
  //       layer.fire("mouseout", {
  //         latlng: latlng,
  //         layerPoint: point,
  //         containerPoint: point,
  //         originalEvent: event.originalEvent,
  //         target: layer,
  //       });
  //     }
  //   });
  // },

  _UpdateAreaperimeter: function (layer) {
    const latlngs = layer.getLatLngs()[0];

    const options = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
  },

  _toggleMeasure: function (btnId = "", activeIcon = "", inactiveIcon = "") {
    if (this.options.isDrawing) {
      this.options.isDrawing = false;
    } else {
      this._measureHandler.enable();
    }
  },

  _clearMeasurements: function () {
    this._measureLayers.clearLayers();
  },

  changeColorByActivePolyline: function (map, customID) {
    this._measureLayers.eachLayer(function (layer) {
      const polyline = layer as L.Polyline;
      if (layer instanceof L.Polyline) {
        if ((layer as L.Polyline).customID === customID) {
          (polyline as L.Polyline)._path.classList.remove("custom-polyline");
          (polyline as L.Polyline).enableEdit();
        } else {
          (polyline as L.Polyline)._path.classList.add("custom-polyline");
          (polyline as L.Polyline).disableEdit();
        }
      }
    });
  },

  changeColorByLastShape: function (map) {
    let lastPolyline = null;

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof L.Polyline) {
        lastPolyline = layer;
        layer._path.classList.add("custom-polyline");
      }
    });

    if (lastPolyline) {
      lastPolyline._path.classList.remove("custom-polyline");
    }
  },

  getVisiblePolylines: function (map) {
    const visiblePolylines = [];
    const mapBounds = map.getBounds();

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof L.Polyline) {
        if (mapBounds.intersects(layer.getBounds())) {
          visiblePolylines.push(layer);
        }
      }
    });

    return visiblePolylines;
  },

  getVisiblePolylinesIds: function (polylinesArr) {
    const idsPolylinesArr = [];
    this.options.visiblePolylines = [];
    polylinesArr.forEach((m) => {
      idsPolylinesArr.push(m.customID);
      this.options.visiblePolylines.push(m.customID);
    });

    this.options.cbVisiblePolylinesChange(idsPolylinesArr);
  },

  getAllPolylines: function (map) {
    const polylines = [];

    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof L.Polyline) {
        polylines.push(layer);
      }
    });

    return polylines;
  },

  removePolylineById: function (map, customID) {
    const self = this;
    this._measureLayers.eachLayer(function (layer) {
      if (layer instanceof L.Polyline && layer.customID === customID) {
        self._measureLayers.removeLayer(layer);
      }
    });
  },

  showActiveShape: function (map, coordinates) {
    this.options.moveToShape = true;
    const bounds = L.latLngBounds(coordinates as L.LatLngExpression[]);
    map.fitBounds(bounds);
  },

  fitMapToPolylines: function (map, polylines) {
    if (polylines.length === 0) {
      return;
    }

    const allBounds = L.latLngBounds(
      polylines[0].getBounds().getNorthEast(),
      polylines[0].getBounds().getSouthWest()
    );

    polylines.forEach((polyline) => {
      const polylineBounds = polyline.getBounds();
      allBounds.extend(polylineBounds);
    });

    map.fitBounds(allBounds);
  },

  replaceLineToPolygon: function (map, layer) {
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

    const polygon = L.polygon(prepareCoordinates, options);

    polygon.customID = layer.customID;
    polygon.customShape = "polygon";

    polygon.addTo(this._measureLayers).showMeasurements().enableEdit();
    // polygon.on("dblclick", this._onPolygonClick.bind(this, map));
    polygon.on("click", () => {
      this.options.cbSetActiveShape(polygon.customID);
      this.options.cbSetUpdateStatusHandler(false);
      this.options.isDrawing = false;
    });
    polygon.on(
      "editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted",
      this._onPolylineDrag.bind(this)
    );

    polygon.on("editable:vertex:dragend", () => {
      this.options.cbSetUpdateStatusHandler(false);
      // Reset status to WAITING when vertex editing ends
      if (this.options.cbSetMapStatus) {
        this.options.cbSetMapStatus("WAITING");
      }
    });

    // Reset status to WAITING when drag ends
    polygon.on("editable:dragend", () => {
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
  getVisibleShapeIdsArr: function (map) {
    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
    return this.options.visiblePolylines;
  },

  findLastCreatedLayer: function (layerGroup) {
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

  loadMeasurements: function (map) {
    if (this.options.shapes.length !== 0) {
      this.options.shapes.forEach((shape) => {
        const { coordinates, options, shapeId, shapeType } = shape;

        const savedShape =
          shapeType === "line"
            ? L.polyline(
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
            : L.polygon(
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

  _toggleMeasurementBtn: function () {
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

  toggleMeasurementMode: function (ifChangeMode = true, map) {
    const mode = this.options.measurementMode;
    if (mode === "measurement") {
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

  changeMeasurementMode: function (mode, map) {
    this.options.measurementMode = mode;
    this.toggleMeasurementMode(false, map);
  },
  changeMeasurementsArr: function (arr) {
    this.options.shapes = arr;
  },
  cancelDrawing: function () {
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
L.control.measurePolygon = function (options) {
  return new L.Control.MeasurePolygon(options);
};
