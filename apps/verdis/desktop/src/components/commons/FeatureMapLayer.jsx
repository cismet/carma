import { useDispatch, useSelector } from "react-redux";
import {
  getFeatureCollection,
  getFlaechenCollection,
  getFrontenCollection,
  getGeneralGeometryCollection,
  getShowBackground,
  getShowCurrentFeatureCollection,
  setToolbarProperties,
} from "../../store/slices/mapping";
import { FeatureCollectionDisplay } from "react-cismap";
import Toolbar from "./Toolbar";
import { useState } from "react";

const FeatureMapLayer = ({ featureTypes }) => {
  const featureCollection = useSelector(getFeatureCollection);
  const flaechenArray = useSelector(getFlaechenCollection);
  const frontenArray = useSelector(getFrontenCollection);
  const generalGeomArray = useSelector(getGeneralGeometryCollection);
  const dispatch = useDispatch();
  const showForeGround = useSelector(getShowCurrentFeatureCollection);
  const showBackGround = useSelector(getShowBackground);
  const filteredCollection = featureCollection?.filter(
    (item) =>
      featureTypes.includes(item.featureType) &&
      !flaechenArray?.some((obj) => obj.id === item.flaecheId) &&
      !frontenArray?.some((obj) => obj.properties.id === item.id) &&
      !generalGeomArray?.some((obj) => obj.properties.id === item.geomId)
  );
  const [hoveredFeature, setHoveredFeature] = useState(undefined);

  const myVirtHoverer = () => {
    const mouseoverHov = (feature) => {
      setHoveredFeature(feature);
      dispatch(setToolbarProperties(feature.properties));
    };

    const mouseoutHov = () => {
      setHoveredFeature(undefined);
      dispatch(setToolbarProperties({}));
    };

    return { mouseoverHov, mouseoutHov };
  };
  myVirtHoverer.virtual = true;

  return (
    <>
      {filteredCollection && (
        <>
          <FeatureCollectionDisplay
            key={"FlaechenLayer-" + showForeGround}
            style={(feature) => {
              return {
                color: showBackGround ? "#00000040" : "#00000000", // stroke
                fillColor: showBackGround ? "#00000020" : "#00000000", //fill
                weight:
                  feature?.id === hoveredFeature?.id
                    ? feature.weight + 2
                    : feature.weight,
              };
            }}
            featureCollection={filteredCollection}
            hoverer={myVirtHoverer}
          />
        </>
      )}
    </>
  );
};

export default FeatureMapLayer;
