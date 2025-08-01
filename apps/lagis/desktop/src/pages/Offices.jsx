import React, { useEffect, useRef, useState } from "react";
import Map from "../components/commons/Map";
import Agencies from "../components/offices/Agencies";
import AdditionalRole from "../components/offices/AdditionalRole";
import Streetfronts from "../components/offices/Streetfronts";
import Notes from "../components/offices/Notes";
import { useSelector, useDispatch } from "react-redux";
import {
  getLandparcel,
  getAlkisLandparcel,
  getGeometry,
} from "../store/slices/lagis";
import {
  noteExtractor,
  streetfrontsExtractor,
  additionalRollExtractor,
  officesPageExtractor,
} from "../core/extractors/officesPageExtractor";
import { mapOfficesExtractor } from "../core/extractors/officesPageExtractor";
import { mapExtractor } from "../core/extractors/commonExtractors";
import { setHasFittedBounds } from "../store/slices/mapping";
import { getBoundsForFeatureArray } from "../core/tools/mappingTools";

const Offices = ({ width = "100%", height = "100%", inStory = false }) => {
  let storyStyle = {};
  if (inStory) {
    storyStyle = {
      borderStyle: "dotted",
      borderWidth: "1px solid",
      padding: "10px",
      backgroundColor: "#F1F1F1",
    };
  }
  const dispatch = useDispatch();

  const landparcel = useSelector(getLandparcel);
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const geometry = useSelector(getGeometry);
  const [extraAgencyGeom, setExtraAgencyGeom] = useState(null);
  const [activeRowId, setActiveRow] = useState(null);

  const mapClickHandler = (feature) => {
    const { agencyTableId } = feature;
    if (agencyTableId !== activeRowId) {
      setActiveRow(agencyTableId);
    }
  };

  useEffect(() => {
    if (extraAgencyGeom) {
      setExtraAgencyGeom(null);
    }
  }, [landparcel]);

  useEffect(() => {
    dispatch(setHasFittedBounds(false));
  }, []);

  return (
    <div
      style={{ ...storyStyle, height }}
      className="offices-page flex flex-col gap-4"
    >
      <div className="flex gap-3 h-[60%]">
        <div className="w-2/5">
          <Agencies
            dataIn={landparcel}
            extractor={officesPageExtractor}
            setAgencyGeom={setExtraAgencyGeom}
            setActiveTableRow={setActiveRow}
            activeRowId={activeRowId}
          />
        </div>
        <div className="w-3/5">
          {extraAgencyGeom ? (
            <Map
              width={width}
              height={height}
              dataIn={{ landparcel, extraAgencyGeom, activeRowId }}
              extractor={mapOfficesExtractor}
              onClickHandler={mapClickHandler}
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
      </div>
      <div className="flex gap-3 h-[calc(40%-18px)]">
        <div className="flex-1">
          <AdditionalRole
            dataIn={landparcel}
            extractor={additionalRollExtractor}
          />
        </div>
        <div className="flex-1">
          <Streetfronts dataIn={landparcel} extractor={streetfrontsExtractor} />
        </div>
        <div className="flex-1">
          <Notes dataIn={landparcel} extractor={noteExtractor} />
        </div>
      </div>
    </div>
  );
};

export default Offices;
