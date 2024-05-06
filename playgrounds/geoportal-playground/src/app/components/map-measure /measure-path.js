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
    polygons: [],
    shapeMode: 'polygon',
    cb: function () {
      console.log('Callback function executed!');
    },
    cbSavePol: function () {
      console.log('Callback function executed!');
    },
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

    this._measureLayers = L.layerGroup().addTo(map);

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
    this._measureLayers = L.layerGroup().addTo(map);
    this._toggleMeasure(
      'img_plg_lines',
      'icon_lineActive',
      'icon_lineInactive'
    );
  },

  _onPolygonClick: function (event) {
    console.log('Polygon clicked:', event);
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
    console.log('yyy layer', preparePolygon);
    this.options.cbSavePol(latlngs);
    // console.log('yyy', event.latlng);
    this._measureLayers.removeLayer(clickedPolygon);
    // this._toggleMeasure();
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

    // this._measureLayers = L.layerGroup().addTo(map);

    /*Created the result panel*/
    this._measurePanel = L.control({ position: 'bottomright' });
    this._measurePanel.onAdd = () => {
      const panel = L.DomUtil.create('div', 'measure-panel');
      panel.style.width = 0 + 'px';
      panel.style.height = 0 + 'px';

      this._content = L.DomUtil.create('div', '', panel);
      this._content.innerHTML = 'Area and perimeter will appear here.';
      return panel;
    };

    this._measurePanel.addTo(map);
    this._measurePanel.remove();

    map.on('draw:created', (event) => {
      this.options.checkonedrawpoligon = true;

      this._measurePanel.addTo(map);

      const layer = event.layer;
      // layer.on('dblclick', this._onPolygonClick.bind(this));
      this._UpdateAreaPerimetro(layer);
      let plugin = this;

      // Add style to polygon
      layer.addTo(this._measureLayers).showMeasurements().enableEdit();
      layer.options.draggable = false;

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

      map.on(
        'editable:drag',
        function () {
          console.log('xxxx');

          layer.updateMeasurements();
          plugin._UpdateAreaPerimetro(layer);
        },
        layer,
        plugin
      );
      map.on(
        'editable:dragend',
        function () {
          console.log('xxxx');

          layer.updateMeasurements();
          plugin._UpdateAreaPerimetro(layer);
        },
        layer,
        plugin
      );

      map.on(
        'editable:vertex:drag editable:vertex:deleted',
        function () {
          console.log('xxxx');

          layer.updateMeasurements();
          // plugin._UpdateAreaPerimetro(layer);
        },
        layer
        // plugin
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

    return iconsWrapper;
  },

  _UpdateAreaPerimetro: function (layer) {
    // const latlngs = layer.getLatLngs()[0];
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

  _toggleMeasure: function (btnId = '', activeIcon = '', inactiveIcon = '') {
    // this.options.cb(true);

    if (this.options.checkonedrawpoligon) {
      this._measureHandler.disable();

      document.getElementById(btnId).src = this.options[inactiveIcon];
      this._clearMeasurements();
      this._measurePanel.remove();
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
