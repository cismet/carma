import L from "leaflet";

(function () {
  "use strict";

  L.Marker.Measurement = L.Layer.extend({
    options: {
      pane: "markerPane",
    },

    initialize: function (
      this: L.Marker.Measurement,
      latlng: L.LatLng,
      measurement: string,
      title: string,
      rotation: number,
      options?: L.Marker.MeasurementOptions
    ) {
      L.setOptions(this, options);

      this._latlng = latlng;
      this._measurement = measurement;
      this._title = title;
      this._rotation = rotation;
    },

    addTo: function (this: L.Marker.Measurement, map: L.Map) {
      map.addLayer(this);
      return this;
    },

    onAdd: function (this: L.Marker.Measurement, map: L.Map) {
      this._map = map;
      const pane = this.getPane
        ? this.getPane()
        : (map as any).getPanes().markerPane;
      const el = (this._element = L.DomUtil.create(
        "div",
        "leaflet-zoom-animated leaflet-measure-path-measurement",
        pane
      ));
      const inner = L.DomUtil.create("div", "", el);
      inner.title = this._title;
      inner.innerHTML = this._measurement;

      map.on("zoomanim", this._animateZoom, this);

      this._setPosition();
      return this;
    },

    onRemove: function (this: L.Marker.Measurement, map: L.Map) {
      map.off("zoomanim", this._animateZoom, this);
      const pane = this.getPane
        ? this.getPane()
        : (map as any).getPanes().markerPane;
      pane.removeChild(this._element);
      this._map = null;
      return this;
    },

    _setPosition: function (this: L.Marker.Measurement) {
      L.DomUtil.setPosition(
        this._element,
        this._map.latLngToLayerPoint(this._latlng)
      );
      this._element.style.transform += " rotate(" + this._rotation + "rad)";
    },

    _animateZoom: function (
      this: L.Marker.Measurement,
      opt: { zoom: number; center: L.LatLng }
    ) {
      const pos = (this._map as any)
        ._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center)
        .round();
      L.DomUtil.setPosition(this._element, pos);
      this._element.style.transform += " rotate(" + this._rotation + "rad)";
    },
  });

  L.marker.measurement = function (
    latLng: L.LatLng,
    measurement: string,
    title: string,
    rotation: number,
    options?: L.Marker.MeasurementOptions
  ): L.Marker.Measurement {
    return new L.Marker.Measurement(
      latLng,
      measurement,
      title,
      rotation,
      options
    );
  };

  const formatDistance = function (this: L.Polyline, d: number): string {
    let unit: string;
    let feet: number;

    if (this._measurementOptions.imperial) {
      feet = d / 0.3048;
      if (feet > 3000) {
        d = d / 1609.344;
        unit = "mi";
      } else {
        d = feet;
        unit = "ft";
      }
    } else {
      if (d > 1000) {
        d = d / 1000;
        unit = "km";
      } else {
        unit = "m";
      }
    }

    if (d < 100) {
      return d.toFixed(1) + " " + unit;
    } else {
      return Math.round(d) + " " + unit;
    }
  };

  const formatArea = function (this: L.Polyline, a: number): string {
    let unit: string;

    if (this._measurementOptions.imperial) {
      if (a > 404.685642) {
        a = a / 4046.85642;
        unit = "ac";
      } else {
        a = a / 0.09290304;
        unit = "ft²";
      }
    } else if (this._measurementOptions.ha) {
      if (a > 1000000000) {
        a = a / 1000000000;
        unit = "km²";
      } else if (a > 10000) {
        a = a / 10000;
        unit = "ha";
      } else {
        unit = "m²";
      }
    } else {
      if (a > 1000000) {
        a = a / 1000000;
        unit = "km²";
      } else {
        unit = "m²";
      }
    }

    if (a < 100) {
      return a.toFixed(1) + " " + unit;
    } else {
      return Math.round(a) + " " + unit;
    }
  };

  const RADIUS = 6378137;
  // ringArea function copied from geojson-area
  // (https://github.com/mapbox/geojson-area)
  // This function is distributed under a separate license,
  // see LICENSE.md.
  const ringArea = function (coords: L.LatLng[]): number {
    const rad = function (deg: number): number {
      return (deg * Math.PI) / 180;
    };
    let p1: L.LatLng,
      p2: L.LatLng,
      p3: L.LatLng,
      lowerIndex: number,
      middleIndex: number,
      upperIndex: number;
    let area = 0;
    const coordsLength = coords.length;

    if (coordsLength > 2) {
      for (let i = 0; i < coordsLength; i++) {
        if (i === coordsLength - 2) {
          // i = N-2
          lowerIndex = coordsLength - 2;
          middleIndex = coordsLength - 1;
          upperIndex = 0;
        } else if (i === coordsLength - 1) {
          // i = N-1
          lowerIndex = coordsLength - 1;
          middleIndex = 0;
          upperIndex = 1;
        } else {
          // i = 0 to N-3
          lowerIndex = i;
          middleIndex = i + 1;
          upperIndex = i + 2;
        }
        p1 = coords[lowerIndex];
        p2 = coords[middleIndex];
        p3 = coords[upperIndex];
        area += (rad(p3.lng) - rad(p1.lng)) * Math.sin(rad(p2.lat));
      }

      area = (area * RADIUS * RADIUS) / 2;
    }

    return Math.abs(area);
  };

  /**
   * Handles the init hook for polylines and circles.
   * Implements the showOnHover functionality if called for.
   */
  const addInitHook = function (this: L.Polyline) {
    const showOnHover =
      this.options.measurementOptions &&
      this.options.measurementOptions.showOnHover;
    if (this.options.showMeasurements && !showOnHover) {
      this.showMeasurements();
    }
    if (this.options.showMeasurements && showOnHover) {
      this.on("mouseover", function (this: L.Polyline) {
        this.showMeasurements();
      });
      this.on("mouseout", function (this: L.Polyline) {
        this.hideMeasurements();
      });
    }
  };

  type MethodFunction = (...args: any[]) => any;

  const override = function (
    method: MethodFunction,
    fn: (...args: any[]) => any,
    hookAfter?: boolean
  ): MethodFunction {
    if (!hookAfter) {
      return function (this: any, ...args: any[]) {
        const originalReturnValue = method.apply(this, args);
        const newArgs = [...args, originalReturnValue];
        return fn.apply(this, newArgs);
      };
    } else {
      return function (this: any, ...args: any[]) {
        fn.apply(this, args);
        return method.apply(this, args);
      };
    }
  };

  L.Polyline.include({
    showMeasurements: function (
      this: L.Polyline,
      options?: L.Marker.MeasurementOptions
    ) {
      if (!this._map || this._measurementLayer) return this;

      this._measurementOptions = L.extend(
        {
          showOnHover: (options && options.showOnHover) || false,
          minPixelDistance: 30,
          showDistances: true,
          showArea: true,
          showTotalDistance: true,
          lang: {
            totalLength: "Total length",
            totalArea: "Total area",
            segmentLength: "Segment length",
          },
        },
        options || {}
      );

      this._measurementLayer = L.layerGroup().addTo(this._map);
      this.updateMeasurements();

      this._map.on("zoomend", this.updateMeasurements, this);

      return this;
    },

    hideMeasurements: function (this: L.Polyline) {
      if (!this._map) return this;

      this._map.off("zoomend", this.updateMeasurements, this);

      if (!this._measurementLayer) return this;
      this._map.removeLayer(this._measurementLayer);
      this._measurementLayer = null;

      return this;
    },

    onAdd: override(
      L.Polyline.prototype.onAdd,
      function (this: L.Polyline, originalReturnValue: any) {
        const showOnHover =
          this.options.measurementOptions &&
          this.options.measurementOptions.showOnHover;
        if (this.options.showMeasurements && !showOnHover) {
          this.showMeasurements(this.options.measurementOptions);
        }

        return originalReturnValue;
      }
    ),

    onRemove: override(
      L.Polyline.prototype.onRemove,
      function (this: L.Polyline, originalReturnValue: any) {
        this.hideMeasurements();

        return originalReturnValue;
      },
      true
    ),

    setLatLngs: override(
      L.Polyline.prototype.setLatLngs,
      function (this: L.Polyline, originalReturnValue: any) {
        this.updateMeasurements();

        return originalReturnValue;
      }
    ),

    formatDistance: formatDistance,
    formatArea: formatArea,

    getCentroid(this: L.Polyline, points: L.LatLng[]): L.LatLng {
      let sumLat = 0;
      let sumLng = 0;
      const numPoints = points.length;

      for (let i = 0; i < numPoints; i++) {
        sumLat += points[i].lat;
        sumLng += points[i].lng;
      }

      const centroidLat = sumLat / numPoints;
      const centroidLng = sumLng / numPoints;

      return L.latLng(centroidLat, centroidLng);
    },

    updateMeasurements: function (this: L.Polyline) {
      if (!this._measurementLayer) return this;

      let latLngs = this.getLatLngs() as L.LatLng[] | L.LatLng[][];
      const isPolygon = this instanceof L.Polygon;
      const options = this._measurementOptions;
      let totalDist = 0;
      let formatter: (value: number) => string;
      let ll1: L.LatLng,
        ll2: L.LatLng,
        p1: L.Point,
        p2: L.Point,
        pixelDist: number,
        dist: number;

      if (
        latLngs &&
        latLngs.length &&
        Array.isArray(latLngs[0]) &&
        (latLngs[0] as any).lat === undefined
      ) {
        // Outer ring is stored as an array in the first element,
        // use that instead.
        latLngs = (latLngs as L.LatLng[][])[0];
      }

      this._measurementLayer.clearLayers();

      if (
        this._measurementOptions.showDistances &&
        (latLngs as L.LatLng[]).length > 1
      ) {
        formatter =
          this._measurementOptions.formatDistance ||
          (L.bind(this.formatDistance, this) as unknown as (
            value: number
          ) => string);

        const latLngsArray = latLngs as L.LatLng[];
        const len = latLngsArray.length;

        for (let i = 1; (isPolygon && i <= len) || i < len; i++) {
          ll1 = latLngsArray[i - 1];
          ll2 = latLngsArray[i % len];
          dist = ll1.distanceTo(ll2);
          totalDist += dist;

          p1 = this._map.latLngToLayerPoint(ll1);
          p2 = this._map.latLngToLayerPoint(ll2);

          pixelDist = p1.distanceTo(p2);

          if (pixelDist >= options.minPixelDistance) {
            L.marker
              .measurement(
                this._map.layerPointToLatLng([
                  (p1.x + p2.x) / 2,
                  (p1.y + p2.y) / 2,
                ]),
                formatter(dist),
                options.lang.segmentLength,
                this._getRotation(ll1, ll2),
                options
              )
              .addTo(this._measurementLayer as any);
          }
        }

        // Show total length for polylines
        if (!isPolygon && this._measurementOptions.showTotalDistance) {
          L.marker
            .measurement(
              ll2,
              formatter(totalDist),
              options.lang.totalLength,
              0,
              options
            )
            .addTo(this._measurementLayer as any);
        }
      }

      if (isPolygon && options.showArea && (latLngs as L.LatLng[]).length > 2) {
        formatter =
          options.formatArea ||
          (L.bind(this.formatArea, this) as unknown as (
            value: number
          ) => string);
        const area = ringArea(latLngs as L.LatLng[]);
        L.marker
          .measurement(
            this.getCentroid(latLngs as L.LatLng[]),
            formatter(area),
            options.lang.totalArea,
            0,
            options
          )
          .addTo(this._measurementLayer as any);
      }

      return this;
    },

    _getRotation: function (this: L.Polyline, ll1: L.LatLng, ll2: L.LatLng) {
      const p1 = this._map.project(ll1);
      const p2 = this._map.project(ll2);

      return Math.atan((p2.y - p1.y) / (p2.x - p1.x));
    },
  });

  L.Polyline.addInitHook(function (this: L.Polyline) {
    addInitHook.call(this);
  });
})();
