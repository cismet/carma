// Create a class for the plugin
L.Control.MeasurePolygon = L.Control.extend({
  options: {
    position: 'topright',
    icon_lineActive: 'https://img.icons8.com/?size=48&id=98497&format=png',
    icon_lineInactive: 'https://img.icons8.com/?size=48&id=98463&format=png',
    icon_polygonActive: 'https://img.icons8.com/?size=48&id=98497&format=png',
    icon_polygonInactive: 'https://img.icons8.com/?size=48&id=98463&format=png',
    html_template: `<p><strong><span style="text-decoration: underline;">Results</span></strong></p>
<p><strong>Area: </strong><br>_p_area</p>
<p><strong>Perimeter : </strong><br>_p_perimetro</p>`,
    height: 130,
    width: 150,
    color_polygon: 'black',
    fillColor_polygon: 'yellow',
    weight_polygon: '2',
    checkonedrawpoligon: false,
    msj_disable_tool: 'Möchten Sie das Tool deaktivieren?',
    shapes: [],
    shapeMode: 'polygon',
    cb: function () {
      console.log('Callback function executed!');
    },
    cbSaveShape: function () {
      console.log('Callback function executed!');
    },
    cdDeleteShape: function () {
      console.log('Callback function executed!');
    },
    cbUpdateShape: function () {
      console.log('Callback function executed!');
    },
    localShapeStore: [],
  },

  drawingPolygons: function (map) {
    this.options.shapeMode = 'polygon';
    this._measureHandler = new L.Draw.Polygon(map, {
      showArea: true,
      shapeOptions: {
        stroke: true,
        color: this.options.color_polygon,
        fillColor: this.options.fillColor_polygon,
        fillOpacity: 0.4,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '1, 9',
        weight: this.options.weight_polygon,
      },
    });

    L.drawLocal.draw.handlers.polygon.tooltip.start =
      'Klicken, um mit dem Zeichnen der Form zu beginnen';
    L.drawLocal.draw.handlers.polygon.tooltip.cont =
      'Klicken Sie, um mit dem Zeichnen der Form fortzufahren';
    L.drawLocal.draw.handlers.polygon.tooltip.end =
      'Klicken, um die Form zu beenden';

    this._toggleMeasure(
      'img_plg_measure_polygon',
      'icon_polygonActive',
      'icon_polygonInactive'
    );
  },

  drawingLines: function (map) {
    this.options.shapeMode = 'line';
    this._measureHandler = new L.Draw.Polyline(map, {
      showLength: true,
      shapeOptions: {
        color: this.options.color_polygon,
        weight: this.options.weight_polygon,
      },
    });

    this._toggleMeasure(
      'img_plg_lines',
      'icon_lineActive',
      'icon_lineInactive'
    );
  },

  saveShapeHandler: function (layer, distance = null, area = null) {
    const latlngs = layer.getLatLngs();
    const latlngsJSON = layer.toGeoJSON();
    const { stroke, color, fillColor, fillOpacity } = layer.options;
    const shapeId = layer._leaflet_id;
    console.log('bbb', latlngsJSON);
    const prepeareCoordinates =
      this.options.shapeMode === 'line'
        ? latlngsJSON.geometry.coordinates
        : latlngsJSON.geometry.coordinates[0];
    const reversedCoordinates = prepeareCoordinates.map((item) => {
      console.log('bbb item', item);
      return item.reverse();
    });

    console.log('bbb r', reversedCoordinates);

    const preparePolygon = {
      coordinates: reversedCoordinates,
      options: {
        stroke,
        color,
        fillColor,
        fillOpacity,
      },
      shapeId,
      distance,
      area,
      shapeType: this.options.shapeMode,
    };
    this.options.cbSaveShape(preparePolygon);
    // TODO 001 delete it in all places
    this.options.localShapeStore.push(preparePolygon);
  },

  _onPolylineDrag: function (event) {
    const polyline = event.target;
    const layer = event.layer;
    const latlngsJSON = layer.toGeoJSON();
    const reversedCoordinates = latlngsJSON.geometry.coordinates.map((item) => {
      return item.reverse();
    });
    polyline.updateMeasurements();
    const shapeId = polyline?.customID
      ? polyline?.customID
      : polyline._leaflet_id;

    this.options.cbUpdateShape(shapeId, reversedCoordinates);
  },

  _onPolygonClick: function (event) {
    const clickedPolygon = event.target;
    const latlngs = clickedPolygon.getLatLngs();
    const { stroke, color, fillColor, fillOpacity } = clickedPolygon.options;
    const preparePolygon = {
      latlngs,
      stroke,
      color,
      fillColor,
      fillOpacity,
    };
    console.log('Polygon clicked:', clickedPolygon);
    // console.log('this._measureLayers', this._measureLayers);
    this._measureLayers.removeLayer(clickedPolygon._leaflet_id);
    const shapeId = clickedPolygon?.customID
      ? clickedPolygon?.customID
      : clickedPolygon._leaflet_id;

    this.options.cdDeleteShape(shapeId, this.options.localShapeStore);
  },

  onAdd: function (map) {
    const linesContainer = L.DomUtil.create(
      'div',
      'leaflet-bar leaflet-control'
    );

    const lineIcon = L.DomUtil.create('a', '', linesContainer);
    lineIcon.innerHTML = `<img id="img_plg_lines" src="${this.options.icon_lineInactive}" width="28" alt="Ruler Icon" style="display: block; margin:auto; height: 100%;">`;
    lineIcon.href = '#';
    lineIcon.title = 'Flächen- und Umfangsmessungen';
    // this.ui_icon = icon;

    const polygonContainer = L.DomUtil.create(
      'div',
      'leaflet-bar leaflet-control'
    );
    const polygonIcon = L.DomUtil.create('a', '', polygonContainer);
    polygonIcon.innerHTML = `<img id="img_plg_measure_polygon" src="${this.options.icon_polygonInactive}" width="24" height="24" alt="Ruler Icon" style="display: block; margin: auto; height: 100%;">`;
    polygonIcon.href = '#';
    polygonIcon.title = 'Flächen- und Umfangsmessungen';
    // this.ui_icon = icon;

    const iconsWrapper = L.DomUtil.create('div', 'm-icons-wrapper');
    iconsWrapper.appendChild(linesContainer);
    iconsWrapper.appendChild(polygonContainer);
    L.DomEvent.on(
      lineIcon,
      'click',
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.drawingLines(map);
      },
      this
    );

    L.DomEvent.on(
      polygonIcon,
      'click',
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.drawingPolygons(map);
      },
      this
    );

    this._map = map;

    this._measureLayers = L.layerGroup().addTo(map);

    // add initial shapes
    if (this.options.shapes.length !== 0) {
      this.options.shapes.forEach((shape) => {
        const { coordinates, options, shapeId, shapeType } = shape;
        if (shapeType === 'line') {
          const savedPolyline = L.polyline(coordinates, options);
          savedPolyline.customID = shapeId;
          savedPolyline
            .addTo(this._measureLayers)
            .showMeasurements()
            .enableEdit();
          savedPolyline.on('dblclick', this._onPolygonClick.bind(this));
          savedPolyline.on(
            'editable:drag editable:vertex:drag editable:vertex:deleted',
            this._onPolylineDrag.bind(this)
          );
        } else {
          const savedPolyline = L.polygon(coordinates, options);
          savedPolyline.customID = shapeId;
          savedPolyline
            .addTo(this._measureLayers)
            .showMeasurements()
            .enableEdit();
          savedPolyline.on('dblclick', this._onPolygonClick.bind(this));
          savedPolyline.on(
            'editable:drag editable:vertex:drag editable:vertex:deleted',
            this._onPolylineDrag.bind(this)
          );
        }
        // savedPolyline.addTo(map);
      });
    }

    map.on('draw:created', (event) => {
      this.options.checkonedrawpoligon = true;

      const layer = event.layer;
      layer.on('dblclick', this._onPolygonClick.bind(this));
      // this._UpdateAreaPerimetro(layer);
      let plugin = this;

      // Add style to polygon
      layer.addTo(this._measureLayers).showMeasurements().enableEdit();
      layer.options.draggable = false;

      const distance = this._UpdateDistance(layer);
      console.log('ddd', distance);

      this.saveShapeHandler(layer, distance);

      layer.on(
        'editable:drag editable:vertex:drag editable:vertex:deleted',
        this._onPolylineDrag.bind(this)
      );

      map.on(
        'editable:dragstart',
        function () {
          console.log('xxxx');

          layer.updateMeasurements();
          plugin._UpdateAreaPerimetro(layer);
        },
        layer,
        plugin
      );

      // map.on(
      //   'editable:drag',
      //   function () {
      //     console.log('xxxx');

      //     layer.updateMeasurements();
      //     // plugin._UpdateAreaPerimetro(layer);
      //   },
      //   layer,
      //   plugin
      // );
      // map.on(
      //   'editable:dragend',
      //   function () {
      //     console.log('xxxx');

      //     layer.updateMeasurements();
      //     // plugin._UpdateAreaPerimetro(layer);
      //   },
      //   layer,
      //   plugin
      // );

      // map.on(
      //   'editable:vertex:drag editable:vertex:deleted',
      //   function () {
      //     console.log('xxxx');

      //     layer.updateMeasurements();
      //     // plugin._UpdateAreaPerimetro(layer);
      //   },
      //   layer
      //   // plugin
      // );

      if (this.options.shapeMode === 'polygon') {
        document.getElementById('img_plg_measure_polygon').src =
          this.options.icon_polygonInactive;
      } else {
        document.getElementById('img_plg_lines').src =
          this.options.icon_lineInactive;
      }

      this.options.checkonedrawpoligon = false;

      // Disabling the drawing tool after creating a polygon
      this._measureHandler.disable();
    });

    return iconsWrapper;
  },

  _UpdateAreaPerimetro: function (layer) {
    const latlngs = layer.getLatLngs()[0];
    // const area = L.GeometryUtil.geodesicArea(latlngs);

    // let perimeter = 0;
    // for (let i = 0; i < latlngs.length - 1; i++) {
    //   perimeter += latlngs[i].distanceTo(latlngs[i + 1]);
    // }
    // perimeter += latlngs[latlngs.length - 1].distanceTo(latlngs[0]);

    // this._content.innerHTML = this.options.html_template;

    const options = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
    // let areaValue = `${area.toLocaleString('en-US', options)} m²`;
    // let perimeterValue = `${perimeter.toLocaleString('en-US', options)} m`;

    // Replace _p_area and _p_perimetro with the values
    // let htmlContent = this.options.html_template;
    // htmlContent = htmlContent.replace('_p_area', areaValue);
    // htmlContent = htmlContent.replace('_p_perimetro', perimeterValue);

    // this._content.innerHTML = htmlContent;
  },

  _UpdateDistance: function (layer) {
    let totalDistance = 0;
    const latlngs = layer.getLatLngs();

    for (let i = 0; i < latlngs.length - 1; i++) {
      const point1 = latlngs[i];
      const point2 = latlngs[i + 1];

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

  _toggleMeasure: function (btnId = '', activeIcon = '', inactiveIcon = '') {
    // this.options.cb(true);

    if (this.options.checkonedrawpoligon) {
      this._measureHandler.disable();

      document.getElementById(btnId).src = this.options[inactiveIcon];
      this._clearMeasurements();
      this.options.checkonedrawpoligon = false;

      // this._clearMeasurements();
    } else {
      this._measureHandler.enable();
      document.getElementById(btnId).src = this.options[activeIcon];
      // document.getElementById(btnId).src = this.options.icon_lineActive;
      // this.options.cb(true);
    }
  },

  _clearMeasurements: function () {
    // console.log('ccc', this._measureLayers);
    this._measureLayers.clearLayers();
    // this.options.cb(false);
  },
});

// Adds the method to create a new instance of the control
L.control.measurePolygon = function (options) {
  return new L.Control.MeasurePolygon(options);
};
