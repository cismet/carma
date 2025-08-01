import React, { useState, useEffect } from "react";
import Map from "../components/commons/Map";
import RentBlock from "../components/rent/RentBlock";
import { useDispatch, useSelector } from "react-redux";
import {
  mapMipaExtractor,
  mipaPageExtractor,
} from "../core/extractors/mipaPageExtractor";
import {
  getAlkisLandparcel,
  getGeometry,
  getLandparcel,
  getMipa,
} from "../store/slices/lagis";
import { mapExtractor } from "../core/extractors/commonExtractors";
import {
  getShowInspectMode,
  setHasFittedBounds,
} from "../store/slices/mapping";

const RentAndLease = ({ width = "100%", height = "100%", inStory = false }) => {
  const dispatch = useDispatch();
  const mipa = useSelector(getMipa);
  const [extraRentsGeom, setExtraRentsGeom] = useState(null);
  const [selectedTableRowId, setSelectedTableRowId] = useState(null);
  const [selectedTableIdByMap, setSelectedTableIdByMap] = useState(null);
  const inspectMode = useSelector(getShowInspectMode);

  const landparcel = useSelector(getLandparcel);
  const geometry = useSelector(getGeometry);
  let storyStyle = {};
  if (inStory) {
    storyStyle = {
      borderStyle: "dotted",
      borderWidth: "1px solid",
      padding: "4px",
    };
  }

  const mapClickHandler = (feature) => {
    const { tableId } = feature;
    setSelectedTableRowId(tableId);
  };

  useEffect(() => {
    if (extraRentsGeom) {
      setExtraRentsGeom(null);
    }
  }, [landparcel]);

  useEffect(() => {
    setTimeout(() => {
      dispatch(setHasFittedBounds(false));
    }, 800);
  }, []);
  return (
    <div
      style={{
        ...storyStyle,
        backgroundColor: "#F1F1F1",
      }}
      className="h-full w-full max-h[calc(100%-30px)]"
    >
      <div className="w-full h-[40%] mb-3 lg:mb-4">
        {extraRentsGeom ? (
          <Map
            width={width}
            height={height}
            dataIn={{
              landparcel,
              geometry: geometry,
              extraGeom: extraRentsGeom,
              inspectMode,
              selectedTableRowId,
            }}
            extractor={mapMipaExtractor}
            onClickHandler={mapClickHandler}
            page="mipa"
          />
        ) : (
          <Map
            width={width}
            height={height}
            dataIn={{ landparcel, geometry }}
            extractor={mapExtractor}
          />
        )}
      </div>

      <div className="h-[calc(60%-20px)]">
        <RentBlock
          dataIn={mipa}
          extractor={mipaPageExtractor}
          selectedTableRowId={selectedTableRowId}
          setSelectedTableRowId={setSelectedTableRowId}
          setExtraRentsGeom={setExtraRentsGeom}
          selectedTableIdByMap={selectedTableRowId}
        />
      </div>
    </div>
  );
};

export default RentAndLease;
