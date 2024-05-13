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
        color: 'blue',
        fillColor: null,
        fillOpacity: 0.2,
        stroke: true,
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
        weight: 3,
        color: '#267bdcd4',
        opacity: 1,
        fillColor: null,
      },
    });

    L.drawLocal.draw.handlers.polyline.tooltip.start =
      'Klicken Sie, um die Linie zu zeichnen';
    L.drawLocal.draw.handlers.polyline.tooltip.cont =
      'Klicken Sie, um mit dem Zeichnen der Linie fortzufahren';
    L.drawLocal.draw.handlers.polyline.tooltip.end =
      'Klicken Sie auf den letzten Punkt der Ziellinie';

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
        color: 'blue',
        fillColor: null,
        opacity: 0.5,
        weigt: 4,
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
    const isLine = layer.toGeoJSON().geometry.type === 'LineString';
    const prepeareCoordinates = isLine
      ? latlngsJSON.geometry.coordinates
      : latlngsJSON.geometry.coordinates[0];
    const reversedCoordinates = prepeareCoordinates.map((item) => {
      return item.reverse();
    });
    polyline.updateMeasurements();
    const newDistance = this._UpdateDistance(layer);
    const shapeId = polyline?.customID
      ? polyline?.customID
      : polyline._leaflet_id;

    this.options.cbUpdateShape(shapeId, reversedCoordinates, newDistance);
  },

  _onPolygonClick: function (event) {
    const clickedPolygon = event.target;
    const latlngs = clickedPolygon.getLatLngs();
    const { stroke, color, fillColor, fillOpacity } = clickedPolygon.options;
    const preparePolygon = {
      color: 'blue',
      fillColor: null,
      fillOpacity: 0.2,
      stroke: true,
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
    lineIcon.innerHTML = `
    <div class="measure_icon_wrapper">
      <img id="img_plg_lines" class='mesure_icon' src="${this.options.icon_lineInactive}" alt="Ruler Icon">
    </div>
  `;
    lineIcon.href = '#';
    lineIcon.title = 'Flächen- und Umfangsmessungen';
    // this.ui_icon = icon;

    const polygonContainer = L.DomUtil.create(
      'div',
      'leaflet-bar leaflet-control measure_icon_wrapper__polygon'
    );
    const polygonIcon = L.DomUtil.create('a', '', polygonContainer);
    polygonIcon.innerHTML = `
    <div class="measure_icon_wrapper">
      <img id="img_plg_measure_polygon" class='mesure_icon' src="${this.options.icon_polygonInactive}" alt="Ruler Icon">
    </div>
  `;
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
        const shapeName = shapeType === 'line' ? 'polyline' : 'polygon';

        const savedShape = L[shapeName](coordinates, {
          showLength: true,
          shapeOptions: {
            weight: 4,
            color: 'blue',
            opacity: 0.5,
          },
        });
        savedShape.customID = shapeId;
        savedShape.addTo(this._measureLayers).showMeasurements().enableEdit();
        savedShape.on('dblclick', this._onPolygonClick.bind(this));
        savedShape.on(
          'editable:drag editable:dragstart editable:dragend editable:vertex:drag editable:vertex:deleted',
          this._onPolylineDrag.bind(this)
        );
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
        'editable:drag editable:vertex:drag editable:vertex:deleted editable:dragstart editable:dragend',
        this._onPolylineDrag.bind(this)
      );

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

    map.on('draw:canceled', () => {
      document.getElementById('img_plg_measure_polygon').src =
        this.options.icon_polygonInactive;
      document.getElementById('img_plg_lines').src =
        this.options.icon_lineInactive;
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
    const isLine = layer.toGeoJSON().geometry.type === 'LineString';
    const latlngs = isLine ? layer.getLatLngs() : layer.getLatLngs()[0];

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
