// Create a class for the plugin
L.Control.MeasurePolygon = L.Control.extend({
  options: {
    position: "topright",
    icon_lineActive: "https://img.icons8.com/?size=48&id=98497&format=png",
    icon_lineInactive: "https://img.icons8.com/?size=48&id=98463&format=png",
    icon_polygonActive: "https://img.icons8.com/?size=48&id=98497&format=png",
    icon_polygonInactive: "https://img.icons8.com/?size=48&id=98463&format=png",
    html_template: `<p><strong><span style="text-decoration: underline;">Results</span></strong></p>
<p><strong>Area: </strong><br>_p_area</p>
<p><strong>Perimeter : </strong><br>_p_perimetro</p>`,
    height: 130,
    width: 150,
    mode_btn: "",
    color_polygon: "black",
    fillColor_polygon: "yellow",
    weight_polygon: "2",
    checkonedrawpoligon: false,
    changeModeButtonActive: false,
    msj_disable_tool: "Möchten Sie das Tool deaktivieren?",
    shapes: [],
    activeShape: null,
    shapeMode: "line",
    measurementOrder: 0,
    moveToShape: false,
    cb: function () {
      console.log("Callback function executed!");
    },
    cbSaveShape: function () {
      console.log("Callback function executed!");
    },
    cdDeleteShape: function () {
      console.log("Callback function executed!");
    },
    cbUpdateShape: function () {
      console.log("Callback function executed!");
    },
    cbVisiblePolylinesChange: function () {
      console.log("Callback function executed!");
    },
    cbSetDrawingStatus: function () {
      console.log("Callback function executed!");
    },
    cbSetDrawingShape: function () {
      console.log("Callback function executed!");
    },
    cbSetActiveShape: function () {
      console.log("Callback function executed!");
    },
    cbSetUpdateStatusHandler: function () {
      console.log("Callback function executed!");
    },
    cbMapMovingEndHandler: function () {
      console.log("Callback function executed!");
    },
    cbSaveLastActiveShapeIdBeforeDrawingHandler: function () {
      console.log("Callback function executed!");
    },
    cbChangeActiveCanceldShapeId: function () {
      console.log("Callback function executed!");
    },
    cbToggleMeasurementMode: function () {
      console.log("Callback function executed!");
    },
    cbGetMeasurementModeHandler: function () {
      console.log("Callback function executed!");
    },
    cbDeleteVisibleShapeById: function () {
      console.log("Callback function executed!");
    },
    cbUpdateAreaOfDrawingMeasurement: function () {
      console.log("Callback function executed!");
    },
    visiblePolylines: [],
    localShapeStore: [],
    ifDrawing: false,
    nativeMove: false,
    currenLine: null,
    polygonMode: false,
    measurementMode: false,
    startDrawing: false,
    customTooltip: null,
  },

  drawingPolygons: function (map) {
    this.options.shapeMode = "polygon";
    this._measureHandler = new L.Draw.Polygon(map, {
      showArea: true,
      shapeOptions: {
        color: "blue",
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
      "icon_polygonInactive",
    );
  },

  drawingLines: function (map, event) {
    this.options.shapeMode = "line";
    this._measureHandler = new L.Draw.Polyline(map, {
      showLength: true,
      shapeOptions: {
        weight: 3,
        color: "#267bdcd4",
        opacity: 1,
      },
    });

    this.options.currenLine = this._measureHandler;

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

    const latlng = event.latlng;

    this.options.currenLine.addVertex(latlng);

    const tooltip = document.querySelector(".leaflet-draw-tooltip");

    const pos = map.latLngToLayerPoint(latlng);
    L.DomUtil.setPosition(tooltip, pos);

    this._toggleMeasure(
      "img_plg_lines",
      "icon_lineActive",
      "icon_lineInactive",
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
    layer.on("click", () => {
      this.options.cbSetActiveShape(layer.customID);
      this.options.cbSetUpdateStatusHandler(false);
    });

    if (this.options.shapeMode === "polygon") {
      const polygon = this.replaceLineToPolygon(map, layer);
      this.options.cbSaveShape(polygon);
      this.getVisibleShapeIdsArr(map);
    } else {
      const prepeareCoordinates =
        this.options.shapeMode === "line"
          ? latlngsJSON.geometry.coordinates
          : latlngsJSON.geometry.coordinates[0];
      const reversedCoordinates = prepeareCoordinates.map((item) => {
        return item.reverse();
      });

      const preparePolygon = {
        coordinates: reversedCoordinates,
        options: {
          color: "blue",
          fillColor: null,
          opacity: 0.5,
          weigt: 4,
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
    this.options.customTooltip.style.visibility = "hidden";

    this.options.cbSetUpdateStatusHandler(true);
    const polyline = event.target;
    const layer = event.layer;
    this.options.cbSetActiveShape(layer.customID);
    const latlngsJSON = layer.toGeoJSON();
    const isLine = layer.toGeoJSON().geometry.type === "LineString";
    const prepeareCoordinates = isLine
      ? latlngsJSON.geometry.coordinates
      : latlngsJSON.geometry.coordinates[0];
    const reversedCoordinates = prepeareCoordinates.map((item) => {
      return item.reverse();
    });

    const square = !isLine ? this.calculateArea(reversedCoordinates) : null;
    polyline.updateMeasurements();
    const newDistance = this._UpdateDistance(layer);
    const shapeId = polyline?.customID
      ? polyline?.customID
      : polyline._leaflet_id;

    this.options.cbUpdateShape(
      shapeId,
      reversedCoordinates,
      newDistance,
      square,
    );
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
      "leaflet-bar leaflet-control dont-show m-container",
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

    // iconsWrapper.appendChild(modeBtn);

    // L.DomEvent.on(
    //   modeBtn,
    //   "click",
    //   (event) => {
    //     event.preventDefault(); // Prevent default action (e.g., redirection)
    //     this.drawingLines(map);
    //   },
    //   this,
    // );

    L.DomEvent.on(
      lineIcon,
      "click",
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.toggleMeasurementMode();
      },
      this,
    );

    this._map = map;

    this._measureLayers = L.layerGroup().addTo(map);

    map.on("click", (event) => {
      this.options.currenLine;
      const mode = this.options.measurementMode;
      if (!this.options.checkonedrawpoligon && mode === "measurement") {
        this.drawingLines(map, event);
        this.options.checkonedrawpoligon = true;
      } else {
        // this.options.checkonedrawpoligon = false;
      }
    });

    map.on("draw:created", (event) => {
      this.options.checkonedrawpoligon = false;
      this.options.ifDrawing = false;

      this.options.cbSetDrawingStatus(false);
      this.options.cbSetDrawingShape(null);

      const layer = event.layer;
      // layer.on("dblclick", this._onPolygonClick.bind(this, map));

      layer.on("editable:vertex:dragend", () => {
        this.options.cbSetUpdateStatusHandler(false);
      });

      // Add style to polygon
      layer.addTo(this._measureLayers).showMeasurements().enableEdit();
      layer.options.draggable = false;

      const distance = this._UpdateDistance(layer);

      this.saveShapeHandler(layer, distance, null, map);

      layer.on(
        "editable:drag editable:vertex:drag editable:vertex:deleted editable:dragstart editable:dragend",
        this._onPolylineDrag.bind(this),
      );

      this.options.checkonedrawpoligon = false;

      this._measureHandler.disable();
    });

    map.on("draw:drawstart", (event) => {
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
        layer.customHandle = index++;
        layer.on("click", (e) => {
          if (e.target.customHandle === 0) {
            this.options.shapeMode = "polygon";
            this.options.currenLine.completeShape();
          }
        });
        layer.on("mouseover", (e) => {
          const coordinates = this._measureHandler._poly._latlngs;
          const latLngArray = coordinates.map((c) => [c.lat, c.lng]);
          latLngArray.push(latLngArray[0]);
          const area = this.calculateArea(latLngArray);
          this.options.customTooltip.style.visibility = "hidden";
          if (e.target.customHandle === 0 && firsHovering) {
            this.options.cbUpdateAreaOfDrawingMeasurement(area);
            L.drawLocal.draw.handlers.polyline.tooltip.end = `Den Startpunkt anklicken, um das Polygon zu schließen.`;
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
            <div>Den Endpunkt des Linienzuges erneut anklicken,
            </div> <div>um die Streckenmessung zu beenden.</div>`;
        }
        if (index > 2) {
          L.drawLocal.draw.handlers.polyline.tooltip.end = `
            <div>Den Endpunkt des Linienzuges erneut anklicken, um die Streckenmessung zu beenden.</div> 
            <div>Zum Messen einer Fläche auf den Startpunkt klicken, um das Polygon zu schließen.</div>`;
        }
      });

      const formatPerimeter = this.calculateDistance(latlngs);
      const distance = this.formatDistance(formatPerimeter);

      if (!this.options.ifDrawing) {
        const shapesObj = {
          coordinates: [latlngs],
          distance,
          shapeId: 5555,
          number: this.options.measurementOrder,
          shapeType: "line",
        };

        this.options.ifDrawing = true;
        this.options.cbSetDrawingStatus(true);
        // this.options.cbSaveShape(shapesObj);
        this.options.cbSetDrawingShape(shapesObj);
      } else {
        const shapesObj = {
          coordinates: [latlngs],
          distance,
          shapeId: 5555,
          shapeType: "line",
          number: this.options.measurementOrder,
        };
        this.options.cbSetDrawingShape(shapesObj);
      }
    });

    map.on("draw:canceled", () => {
      this.options.checkonedrawpoligon = true;
      this.options.cbSetDrawingStatus(false);

      this._toggleMeasure(
        "img_plg_lines",
        "icon_lineActive",
        "icon_lineInactive",
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

      const mode = this.options.measurementMode;
      if (!this.options.customTooltip && mode === "measurement") {
        const popupPane = map._panes.popupPane;

        this.options.customTooltip = L.DomUtil.create(
          "div",
          "leaflet-draw-custom-tooltip",
          popupPane,
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
        L.DomUtil.setPosition(this.options.customTooltip, {
          x: pos.x + offsetX,
          y: pos.y,
        });
        if (target.classList.contains("leaflet-div-icon")) {
          this.options.customTooltip.style.visibility = "hidden";
        }
        if (target.classList.contains("leaflet-container")) {
          this.options.customTooltip.style.visibility = "visible";
        }
      }
    });

    map.on("mouseout", (event) => {
      this.options.customTooltip.style.visibility = "hidden";
    });

    return iconsWrapper;
  },

  _UpdateAreaPerimetro: function (layer) {
    const latlngs = layer.getLatLngs()[0];

    const options = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
  },

  _UpdateDistance: function (layer) {
    let totalDistance = 0;
    const isLine = layer.toGeoJSON().geometry.type === "LineString";
    const latlngs = isLine ? layer.getLatLngs() : layer.getLatLngs()[0];

    if (!isLine) {
      latlngs.push(latlngs[0]);
    }

    for (let i = 0; i < latlngs.length - 1; i++) {
      const point1 = latlngs[i];
      const point2 = latlngs[i + 1];

      const distance = point1.distanceTo(point2);

      totalDistance += distance;
    }

    if (!isLine) {
      latlngs.pop(latlngs[latlngs.length - 1]);
    }

    const formatPerimeter = (perimeter) => {
      if (perimeter >= 1000) {
        return `${(perimeter / 1000).toFixed(2)} km`;
      } else {
        return `${perimeter.toFixed(2)} m`;
      }
    };

    return formatPerimeter(totalDistance);
  },

  _UpdateDistanceByLatLngs: function (latlngs) {
    let totalDistance = 0;

    for (let i = 0; i < latlngs.length - 1; i++) {
      const point1 = L.latLng(latlngs[i][0], latlngs[i][1]);
      const point2 = L.latLng(latlngs[i + 1][0], latlngs[i + 1][1]);

      const distance = point1.distanceTo(point2);
      totalDistance += distance;
    }

    const formatPerimeter = (perimeter) => {
      if (perimeter >= 1000) {
        return `${(perimeter / 1000).toFixed(2)} km`;
      } else {
        return `${perimeter.toFixed(2)} m`;
      }
    };

    return formatPerimeter(totalDistance);
  },

  calculateDistance: function (latlngs) {
    let totalDistance = 0;

    for (let i = 0; i < latlngs.length - 1; i++) {
      const point1 = latlngs[i];
      const point2 = latlngs[i + 1];

      const distance = point1.distanceTo(point2);

      totalDistance += distance;
    }

    return totalDistance;
  },

  calculateArea: function (latlngs) {
    const toRadians = (degree) => (degree * Math.PI) / 180;

    if (latlngs.length < 3) return 0;

    const earthRadius = 6378137;

    let total = 0;
    for (let i = 0, l = latlngs.length; i < l; i++) {
      const [lat1, lon1] = latlngs[i];
      const [lat2, lon2] = latlngs[(i + 1) % l];

      total +=
        toRadians(lon2 - lon1) *
        (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
    }

    total = Math.abs((total * earthRadius * earthRadius) / 2);

    const formatArea = (area) => {
      if (area >= 1000000) {
        return `${(area / 1000000).toFixed(2)} km²`;
      } else {
        return `${area.toFixed(2)} m²`;
      }
    };

    return formatArea(total);
  },

  formatDistance: function (perimeter) {
    const formatPerimeter = (perimeter) => {
      if (perimeter >= 1000) {
        return `${(perimeter / 1000).toFixed(2)} km`;
      } else {
        return `${perimeter.toFixed(2)} m`;
      }
    };

    return formatPerimeter(perimeter);
  },

  _toggleMeasure: function (btnId = "", activeIcon = "", inactiveIcon = "") {
    if (this.options.checkonedrawpoligon) {
      this.options.checkonedrawpoligon = false;
    } else {
      this._measureHandler.enable();
    }
  },

  _clearMeasurements: function () {
    this._measureLayers.clearLayers();
  },

  changeColorByActivePolyline: function (map, customID) {
    map.eachLayer(function (layer) {
      const polyline = layer;
      if (layer instanceof L.Polyline) {
        if (layer.customID === customID) {
          polyline._path.classList.remove("custom-polyline");
        } else {
          polyline._path.classList.add("custom-polyline");
        }
      }
    });
  },

  changeColorByLastShape: function (map) {
    let lastPolyline = null;

    map.eachLayer(function (layer) {
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

    map.eachLayer(function (layer) {
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

    map.eachLayer(function (layer) {
      if (layer instanceof L.Polyline) {
        polylines.push(layer);
      }
    });

    return polylines;
  },

  removePolylineById: function (map, customID) {
    map.eachLayer(function (layer) {
      if (layer instanceof L.Polyline && layer.customID === customID) {
        map.removeLayer(layer);
      }
    });
  },

  showActiveShape: function (map, coordinates) {
    this.options.moveToShape = true;
    const bounds = L.latLngBounds(coordinates);
    map.fitBounds(bounds);
  },

  fitMapToPolylines: function (map, polylines) {
    if (polylines.length === 0) {
      return;
    }

    const allBounds = L.latLngBounds();

    polylines.forEach((polyline) => {
      const polylineBounds = polyline.getBounds();
      allBounds.extend(polylineBounds);
    });

    map.fitBounds(allBounds);
  },

  replaceLineToPolygon: function (map, layer) {
    const latlngsJSON = layer.toGeoJSON();
    const prepeareCoordinates = latlngsJSON.geometry.coordinates.map((l) => {
      return l.reverse();
    });

    map.removeLayer(layer);

    prepeareCoordinates.push(prepeareCoordinates[0]);

    const options = {
      color: "#3388ff",
      fillColor: "#3388ff",
      opacity: 1,
      weigt: 3,
    };
    const distance = this._UpdateDistanceByLatLngs(prepeareCoordinates);
    const square = this.calculateArea(prepeareCoordinates);
    const preparePolygon = {
      coordinates: prepeareCoordinates,
      options,
      shapeId: layer.customID,
      distance: distance,
      number: this.options.measurementOrder,
      area: square,
      shapeType: this.options.shapeMode,
    };

    const polygon = L.polygon(prepeareCoordinates, options);

    polygon.customID = layer.customID;
    polygon.customShape = "polygon";

    polygon.addTo(this._measureLayers).showMeasurements().enableEdit();
    // polygon.on("dblclick", this._onPolygonClick.bind(this, map));
    polygon.on("click", () => {
      this.options.cbSetActiveShape(polygon.customID);
      this.options.cbSetUpdateStatusHandler(false);
    });
    polygon.on(
      "editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted",
      this._onPolylineDrag.bind(this),
    );

    polygon.on("editable:vertex:dragend", () => {
      this.options.cbSetUpdateStatusHandler(false);
    });

    this.options.polygonMode = false;

    this.options.checkonedrawpoligon = true;

    this._toggleMeasure(
      "img_plg_lines",
      "icon_lineActive",
      "icon_lineInactive",
    );

    // this.options.checkonedrawpoligon = false;

    // this._measureHandler.disable();

    return preparePolygon;
  },
  getVisibleShapeIdsArr: function (map) {
    const allPolyLines = this.getVisiblePolylines(map);
    this.getVisiblePolylinesIds(allPolyLines);
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
        const shapeName = shapeType === "line" ? "polyline" : "polygon";

        const savedShape = L[shapeName](coordinates, {
          showLength: true,
          className: "custom-polyline",
          shapeOptions: {
            weight: 4,
            color: "#267bdcd4",
            opacity: 1,
          },
        });
        savedShape.customID = shapeId;
        savedShape.addTo(this._measureLayers).showMeasurements().enableEdit();
        savedShape.on("click", () => {
          this.options.checkonedrawpoligon = true;
          this.options.cbSetActiveShape(savedShape.customID);
          this.options.cbSetUpdateStatusHandler(false);
        });
        savedShape.on("mouseout", (e) => {
          this.options.checkonedrawpoligon = false;
          this.options.customTooltip.style.visibility = "inherit";
        });
        savedShape.on("mouseover", (e) => {
          this.options.customTooltip.style.visibility = "hidden";
        });
        savedShape.on(
          "editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted",
          this._onPolylineDrag.bind(this),
        );

        savedShape.on("editable:vertex:dragend", () => {
          this.options.cbSetUpdateStatusHandler(false);
        });
      });
    }
  },

  _toggleMeasurementBtn: function () {
    if (this.options.changeModeButtonActive) {
      document.getElementById("img_plg_lines").src =
        this.options.icon_lineInactive;
      this.options.changeModeButtonActive = false;
    } else {
      document.getElementById("img_plg_lines").src =
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

      document.getElementById("img_plg_lines").src =
        this.options.icon_lineActive;

      // if (this.options.isFirstLoading) {
      //   this.options.isFirstLoading = false;
      // }

      const customTooltip = document.querySelector("#routedMap");
      customTooltip.style.cursor = "crosshair";
      console.log("xxx customTooltip", customTooltip);
    } else {
      this._clearMeasurements();

      const customTooltip = document.querySelector("#routedMap");
      customTooltip.style.cursor = "pointer";
      if (this.options.currenLine) {
        this.options.currenLine.disable();
      }
      customTooltip.style.cursor = "pointer";
      // const drawBtn = document.getElementById("draw_shape");
      // drawBtn.classList.add("hide-draw-btn");
      this.options.checkonedrawpoligon = false;
      document.getElementById("img_plg_lines").src =
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
    if (this.options.ifDrawing) {
      this._measureHandler.disable();
      this.options.ifDrawing = false;

      this._measureLayers.clearLayers();

      this.options.cbSetDrawingStatus(false);
      this.options.cbDeleteVisibleShapeById(5555);
      // this.options.checkonedrawpoligon = true;
    }
  },
});

// Adds the method to create a new instance of the control
L.control.measurePolygon = function (options) {
  return new L.Control.MeasurePolygon(options);
};
