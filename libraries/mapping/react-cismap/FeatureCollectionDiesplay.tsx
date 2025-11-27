import React, { useContext } from "react";
import PropTypes from "prop-types";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import * as turfHelpers from "@turf/helpers";
import bboxPolygon from "@turf/bbox-polygon";
import intersect from "@turf/intersect";
import polylabel from "polylabel";
import proj4 from "proj4";
import { TopicMapContext } from "../../contexts/TopicMapContextProvider";
import { ProjGeoJson } from "react-cismap";
import { proj4crs25832def } from "../../utils/constants";
import { getLabelPosition } from "../../utils/gisHelper";

// Since this component is simple and static, there's no parent container for it.
const FeatureCollectionDisplayWithTooltipLabels = ({
  featureCollection = [],
  boundingBox,
  style,
  labeler,
  hoverer,
  featureClickHandler,
  mapRef,
  clusterOptions = {},
  clusteringEnabled,
  editable = false,
  inbackground = false,
  defaultContextValues = {},
  appMode,
  secondarySelection,
}) => {
  const { boundingBox: boundingBoxFromContext } =
    useContext(TopicMapContext) || defaultContextValues;
  let markers = [];
  let markerPos = [];
  let _boundingBox = boundingBox || boundingBoxFromContext;

  let bbox = [
    _boundingBox.left,
    _boundingBox.bottom,
    _boundingBox.right,
    _boundingBox.top,
  ];
  let view = bboxPolygon(bbox);
  let selectedMarkers = [];
  let selectionSpiderfyMinZoom = clusterOptions.selectionSpiderfyMinZoom;
  if (labeler && featureCollection.length > 0) {
    for (let currentfeatureIdx in featureCollection) {
      let currentFeature = featureCollection[currentfeatureIdx];
      if (
        currentFeature.geometry.type === "Polygon" ||
        (currentFeature.geometry.type === "MultiPolygon" &&
          currentFeature.geometry.coordinates.length === 1)
      ) {
        //console.log("Polygon");
        let coordinates = null;
        if (currentFeature.geometry.type === "Polygon") {
          coordinates = currentFeature.geometry.coordinates;
        } else {
          //must currentFeature.geometry.type==='MultiPolygon' && currentFeature.geometry.coordinates.length===1
          coordinates = currentFeature.geometry.coordinates[0];
        }

        let marker = createPolygonMarker(
          currentFeature,
          "marker." + currentFeature.id,
          coordinates,
          view,
          markerPos,
          labeler,
          inbackground
        );
        if (currentFeature.selected === true) {
          selectedMarkers.push(marker);
        } else {
          markers.push(marker);
        }
      } else if (
        currentFeature.geometry.type === "MultiPolygon" &&
        currentFeature.geometry.coordinates.length > 1
      ) {
        //console.log("Multipolygon mit "+currentFeature.geometry.coordinates.length);
        for (let currentsubfeatureIdx in currentFeature.geometry.coordinates) {
          let coordinates =
            currentFeature.geometry.coordinates[currentsubfeatureIdx];
          let marker = createPolygonMarker(
            currentFeature,
            "marker.subfeature" +
              currentFeature.id +
              "." +
              currentsubfeatureIdx,
            coordinates,
            view,
            markerPos,
            labeler,
            inbackground
          );
          if (currentFeature.selected === true) {
            selectedMarkers.push(marker);
          } else {
            markers.push(marker);
          }
        }
      } else if (currentFeature.geometry.type === "Point") {
        // console.log('createMarker');
        let marker = createPointMarker(
          currentFeature,
          currentFeature.geometry.coordinates,
          labeler
        );
        if (currentFeature.selected === true) {
          selectedMarkers.push(marker);
        } else {
          markers.push(marker);
        }
      }
    }
    for (let midx in selectedMarkers) {
      markers.push(selectedMarkers[midx]);
    }
  }
  // console.log("FeatureCollectionDisplayWITHTOOLTIPLABELS appMode", appMode);

  return (
    <div>
      <ProjGeoJson
        key={
          JSON.stringify(featureCollection) + "." + JSON.stringify(boundingBox)
        }
        featureCollection={featureCollection}
        clusteringEnabled={clusteringEnabled}
        clusterOptions={clusterOptions}
        hoverer={hoverer}
        style={style}
        featureClickHandler={featureClickHandler}
        mapRef={mapRef}
        selectionSpiderfyMinZoom={selectionSpiderfyMinZoom}
        editable={editable}
      />
      {markers}
    </div>
  );
};

function createPointMarker(currentFeature, coordinates, labeler) {
  // console.log(coordinates);
  let pointWGS84 = proj4(proj4crs25832def, proj4.defs("EPSG:4326"), [
    coordinates[0],
    coordinates[1],
  ]);
  // console.log('pointWGS84', pointWGS84);

  return (
    <Marker
      key={"marker." + currentFeature.id}
      position={[pointWGS84[1], pointWGS84[0]]}
      opacity={0.0}
      offset={new L.point(0, 0)}
    >
      <Tooltip
        className={"customGeoJSONFeatureTooltipClass"}
        permanent={true}
        direction={"center"}
      >
        <div>{labeler(currentFeature)}</div>
      </Tooltip>
    </Marker>
  );
}

function createPolygonMarker(
  currentFeature,
  key,
  coordinates,
  view,
  markerPos,
  labeler,
  inbackground
) {
  //get the subfeature into a polygon

  let polygon = turfHelpers.polygon(coordinates);
  let newPoly = intersect(view, polygon);

  let pointOnPolygon = null;
  if (newPoly) {
    pointOnPolygon = getLabelPosition(newPoly); //if there is a multipolygon created from the boundingbox intersects use the first
  } else {
    pointOnPolygon = polylabel(coordinates);
  }

  if (isNaN(pointOnPolygon[0])) {
    pointOnPolygon = polylabel(coordinates);
  }
  let pointOnPolygonWGS84 = proj4(proj4crs25832def, proj4.defs("EPSG:4326"), [
    pointOnPolygon[0],
    pointOnPolygon[1],
  ]);

  let offset = null;
  let position = [pointOnPolygonWGS84[1], pointOnPolygonWGS84[0]];
  if (markerPos.includes(position[0] + "-" + position[1])) {
    offset = new L.point(15, 15);
  } else {
    offset = new L.point(-15, -15);
  }
  markerPos.push(position[0] + "-" + position[1]);
  return (
    <Marker
      key={key}
      position={[pointOnPolygonWGS84[1], pointOnPolygonWGS84[0]]}
      opacity={0.0}
      onClick={labelClick}
      icon={L.divIcon({
        className: "leaflet-mouse-marker",
        iconAnchor: [20, 20],
        iconSize: [40, 40],
      })}
    >
      <Tooltip
        className={"customGeoJSONFeatureTooltipClass"}
        permanent={true}
        direction={"center"}
        offset={offset}
        onClick={labelClick}
        pane={
          inbackground === true
            ? "backgroundlayerTooltips"
            : "backgroundlayerTooltips"
        }
      >
        <div>{labeler(currentFeature)}</div>
      </Tooltip>
    </Marker>
  );
}

function labelClick(event) {
  // console.log("TOOOOOOLTIP");
  // console.log(event);
}

export default FeatureCollectionDisplayWithTooltipLabels;
FeatureCollectionDisplayWithTooltipLabels.propTypes = {
  featureCollection: PropTypes.array.isRequired,
  boundingBox: PropTypes.object,
  selectionSpiderfyMinZoom: PropTypes.number,
  style: PropTypes.func.isRequired,
  labeler: PropTypes.func,
  hoverer: PropTypes.func,
  featureClickHandler: PropTypes.func.isRequired,
  mapRef: PropTypes.object,
};
