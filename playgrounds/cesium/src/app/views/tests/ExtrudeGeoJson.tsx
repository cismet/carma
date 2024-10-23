import React from "react";

import { GeoJsonDataSource as ResiumGeoJsonDataSource } from "resium";
import {
  Color,
  ConstantProperty,
  Entity,
  GeoJsonDataSource,
  HeightReference,
  PolygonGraphics,
} from "cesium";

//const CP_TRUE = new ConstantProperty(true);
const CP_FALSE = new ConstantProperty(false);
const HEIGHT = new ConstantProperty(0);
const EXTRUDED_HEIGHT = new ConstantProperty(50);

const HEIGHT_REF = new ConstantProperty(HeightReference.RELATIVE_TO_GROUND);
const EXTRUDED_HEIGHT_REF = new ConstantProperty(
  HeightReference.RELATIVE_TO_GROUND
);

const extrudePerEnitity = (entity: Entity) => {
  if (
    entity.polygon !== undefined &&
    entity.polygon instanceof PolygonGraphics
  ) {
    const { polygon } = entity;
    //console.log('polygon', polygon);
    polygon.closeBottom = CP_FALSE;
    polygon.extrudedHeight = EXTRUDED_HEIGHT;
    polygon.extrudedHeightReference = EXTRUDED_HEIGHT_REF;
    polygon.height = HEIGHT;
    polygon.heightReference = HEIGHT_REF;
    // dont render edges
    polygon.outline = CP_FALSE;
  }
};

const handleOnLoad = (dataSource: GeoJsonDataSource) => {
  dataSource.entities.values.forEach(extrudePerEnitity);
};

function View() {
  return (
    <ResiumGeoJsonDataSource
      data="https://wupp-3d-data.cismet.de/nutzung/brachflaechen4326.p6.json"
      fill={Color.LIME.withAlpha(0.4)}
      onLoad={handleOnLoad}
    />
  );
}

export default View;
