import L from "leaflet";
import "leaflet-editable";
import "leaflet.path.drag";
import "proj4leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { isFunction } from "lodash";
import { Component } from "react";

// Ported from react-cismap/ProjGeoJson and modernized: no react-leaflet dependency
// anymore (the original extended the react-leaflet v1 Path class); the layer
// lifecycle is handled directly on the L.Map from mapRef.
class ProjGeoJson extends Component {
  componentDidMount() {
    this.ensureLayer();
  }

  componentDidUpdate(prevProps) {
    // the map ref can arrive after the first render
    this.ensureLayer();
    if (!this.leafletElement) {
      return;
    }
    if (isFunction(this.props.style)) {
      this.leafletElement.setStyle(this.props.style);
    } else if (this.props.style && this.props.style !== prevProps.style) {
      this.leafletElement.setStyle(this.props.style);
    }
  }

  componentWillUnmount() {
    this.removeLayer();
  }

  getMap() {
    return this.props.mapRef?.leafletElement;
  }

  removeLayer() {
    const map = this.getMap();
    if (this.leafletElement && map && map.hasLayer(this.leafletElement)) {
      map.removeLayer(this.leafletElement);
    }
    this.leafletElement = null;
    this.clusteredMarkers = null;
  }

  ensureLayer() {
    if (this.leafletElement) {
      return;
    }
    const map = this.getMap();
    if (!map) {
      return;
    }

    const { featureCollection, ...options } = this.props;
    const featureStylerScalableImageSize =
      this.props.featureStylerScalableImageSize ?? 32;

    options.onEachFeature = (feature, layer) => {
      layer.feature = feature;
      if (options.snappingGuides === true) {
        layer.snappingGuide = true;
      }
      if (options.customType !== undefined) {
        layer.customType = options.customType;
      }
      if (options.featureClickHandler !== undefined) {
        layer.on("click", (event) => {
          if (!event.originalEvent._simulated) {
            options.featureClickHandler(event, feature, layer);
          }
        });
      }
      if (options.editable === true) {
        layer.on("dblclick", L.DomEvent.stop).on("dblclick", () => {
          layer.toggleEdit();
          layer.feature.inEditMode = layer.editEnabled();
          (options.editModeStatusChanged || (() => {}))(layer.feature);
        });
      }
      // no bringToFront() for selected features anymore: the z-order is fully
      // controlled by the order of the featureCollection array (later features
      // are rendered on top), see sortFeaturesForRendering in FeatureCollection
      if (options.labeler) {
        layer.bindTooltip(options.labeler(feature), {
          className: "customGeoJSONFeatureTooltipClass",
          permanent: true,
          direction: "center",
          offset: new L.point(0, 0),
          opacity: "0.9",
        });
      }
      if (options.hoverer) {
        const theStyle = options.style(feature, featureStylerScalableImageSize);
        if (options.hoverer?.virtual !== true) {
          layer.bindTooltip("" + options.hoverer(feature), {
            offset: L.point(theStyle.radius || 1, 0),
            direction: "right",
          });
        }
        const { mouseoverHov, mouseoutHov } = options.hoverer(feature);
        layer.on("mouseover", (e) => {
          if (options.hoverer?.virtual !== true) {
            layer.openTooltip(e.latlng);
          } else {
            mouseoverHov(feature, e);
          }
        });
        layer.on("mouseout", (e) => {
          if (options.hoverer?.virtual !== true) {
            layer.closeTooltip();
          } else {
            mouseoutHov(feature, e);
          }
        });
      }
    };

    options.pointToLayer = (feature, latlng) => {
      if (options.style) {
        const theStyle = options.style(feature, undefined);
        if (
          theStyle.svg ||
          theStyle.defaultMarker === true ||
          theStyle.customMarker !== undefined
        ) {
          if (theStyle.customMarker !== undefined) {
            return L.marker(latlng, { icon: theStyle.customMarker });
          } else if (theStyle.svg !== undefined) {
            const divIcon = L.divIcon({
              className: "leaflet-data-marker",
              html: theStyle.svg,
              iconAnchor: [theStyle.svgSize / 2, theStyle.svgSize / 2],
              iconSize: [theStyle.svgSize, theStyle.svgSize],
            });
            return L.marker(latlng, { icon: divIcon });
          } else {
            return L.marker(latlng);
          }
        } else {
          return L.circleMarker(latlng, { radius: 2 });
        }
      }
    };

    const geojson = L.Proj.geoJson(featureCollection, options);

    if (this.props.clusteringEnabled) {
      const clusterOptions = {
        ...(this.props.clusterOptions || {}),
        customSize: 36,
      };
      this.clusteredMarkers = L.markerClusterGroup(clusterOptions);
      this.clusteredMarkers.addLayer(geojson);
      this.leafletElement = this.clusteredMarkers;

      // needs to be on the map already, because of the spiderfy functionality
      // (ensure spiderfication when an object is selected)
      try {
        map.addLayer(this.leafletElement);
      } catch (e) {
        // ignore (legacy behavior: adding could fail during background switches)
      }

      this.clusteredMarkers.on("clusterclick", (a) => {
        if (map.getZoom) {
          const zoomLevel = map.getZoom();
          if (zoomLevel < (clusterOptions.cismapZoomTillSpiderfy || 11)) {
            map.setZoomAround(a.latlng, zoomLevel + 1);
          } else {
            a.layer.spiderfy();
          }
        }
      });

      for (const marker of this.clusteredMarkers.getLayers()) {
        if (marker.feature.selected === true) {
          const parent = this.clusteredMarkers.getVisibleParent(marker);
          if (
            parent &&
            parent.spiderfy &&
            map.getZoom() >= (this.props.selectionSpiderfyMinZoom || 12)
          ) {
            setTimeout(() => {
              try {
                parent.spiderfy();
              } catch (err) {
                // ignore
              }
            }, 1);
          }
        }
      }
    } else {
      this.leafletElement = geojson;
      map.addLayer(this.leafletElement);
    }
  }

  render() {
    return null;
  }
}

export default ProjGeoJson;
