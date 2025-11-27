import React, { useContext } from "react";

import ExtraMarker from "react-cismap/ExtraMarker";

import proj4 from "proj4";
import { TopicMapContext } from "../../contexts/TopicMapContextProvider";
import { proj4crs3857def } from "../../utils/constants";

const GazetteerHitDisplay = ({
  gazetteerHit,
  referenceSystemDefinition,
  defaultContextValues = {},
}) => {
  const { referenceSystemDefinition: contextReferenceSystemDefinition } =
    useContext(TopicMapContext) || defaultContextValues;

  const _referenceSystemDefinition =
    referenceSystemDefinition || contextReferenceSystemDefinition;

  let gazMarker = null;

  if (gazetteerHit != null) {
    const projDef = _referenceSystemDefinition || proj4crs3857def;
    const pos = proj4(projDef, proj4.defs("EPSG:4326"), [
      gazetteerHit.x,
      gazetteerHit.y,
    ]);
    let markerOptions = {
      icon: (gazetteerHit.glyphPrefix || "") + "fa-" + gazetteerHit.glyph,
      markerColor: "cyan",
      spin: false,
      prefix: "fas",
    };
    gazMarker = (
      <ExtraMarker
        key={"gazmarker." + JSON.stringify(gazetteerHit)}
        markerOptions={markerOptions}
        position={[pos[1], pos[0]]}
      />
    );
  }
  return gazMarker;
};

export default GazetteerHitDisplay;
