import React, { useState, useEffect } from "react";

import { GeoJsonDataSource as ResiumGeoJsonDataSource } from "resium";
import {
  Color,
  ConstantProperty,
  Entity,
  GeoJsonDataSource,
  HeightReference,
  PolygonGraphics,
} from "cesium";
import { useCesiumViewer } from "../../../lib/cesium-engine-snapshot/src/lib/hooks/useCesiumViewer";

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
  console.log(
    "ExtrudeGeoJson: Data loaded, entities count:",
    dataSource.entities.values.length
  );
  dataSource.entities.values.forEach(extrudePerEnitity);
  console.log("ExtrudeGeoJson: Extrusion applied to all entities");
};

function View() {
  const viewer = useCesiumViewer();
  const [tilesetReady, setTilesetReady] = useState(false);

  useEffect(() => {
    if (!viewer) {
      console.debug("ExtrudeGeoJson: No viewer yet");
      return;
    }

    let timeoutId: number | undefined;
    let isChecking = true;

    const checkTileset = () => {
      if (!isChecking) return;

      const primitiveCount = viewer.scene?.primitives?.length || 0;
      if (primitiveCount > 0) {
        console.log(
          "ExtrudeGeoJson: Tileset added to scene (",
          primitiveCount,
          "primitives), loading GeoJSON"
        );
        setTilesetReady(true);
        isChecking = false;
      } else {
        console.debug(
          "ExtrudeGeoJson: Waiting for tileset... (primitives:",
          primitiveCount,
          ")"
        );
        timeoutId = window.setTimeout(checkTileset, 200);
      }
    };

    console.log("ExtrudeGeoJson: Starting tileset check in 1 second");
    timeoutId = window.setTimeout(checkTileset, 1000);

    return () => {
      isChecking = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [viewer]);

  if (!tilesetReady) {
    console.debug("ExtrudeGeoJson: Not rendering - waiting for tileset");
    return null;
  }

  return (
    <ResiumGeoJsonDataSource
      data="https://wupp-3d-data.cismet.de/nutzung/brachflaechen4326.p6.json"
      fill={Color.LIME.withAlpha(0.4)}
      onLoad={handleOnLoad}
    />
  );
}

export default View;
