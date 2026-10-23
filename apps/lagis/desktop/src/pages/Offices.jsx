import React, { useEffect, useRef, useState } from "react";
import Map from "../components/commons/Map";
import Agencies from "../components/offices/Agencies";
import AdditionalRole from "../components/offices/AdditionalRole";
import Notes from "../components/offices/Notes";
import { useSelector, useDispatch } from "react-redux";
import {
  getLandparcel,
  getAlkisLandparcel,
  getGeometry,
} from "../store/slices/lagis";
import {
  noteExtractor,
  additionalRollExtractor,
  officesPageExtractor,
} from "../core/extractors/officesPageExtractor";
import { mapOfficesExtractor } from "../core/extractors/officesPageExtractor";
import { mapExtractor } from "../core/extractors/commonExtractors";
import { setHasFittedBounds } from "../store/slices/mapping";
import { getBoundsForFeatureArray } from "../core/tools/mappingTools";
import AreaMap from "../components/editing/AreaMap";
import AreaSummary from "../components/editing/AreaSummary";
import useAgencyAreas from "../components/offices/useAgencyAreas";

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
  const agencyAreas = useAgencyAreas();

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

  // the view map remounts after editing and has to fit the parcel again
  useEffect(() => {
    dispatch(setHasFittedBounds(false));
  }, [agencyAreas.editable]);

  return (
    <div
      style={{ ...storyStyle, height }}
      className="offices-page flex flex-col gap-4"
    >
      <div className="h-[60%] min-h-0">
        {agencyAreas.editable ? (
          <div className="flex h-full flex-col gap-2">
            {agencyAreas.rows.length >= 2 && (
              <AreaSummary
                parcelArea={agencyAreas.parcelArea}
                rows={agencyAreas.rows}
              />
            )}
            <AreaMap
              parcelGeometry={agencyAreas.parcelGeometry}
              {...agencyAreas.mapProps}
            />
          </div>
        ) : extraAgencyGeom ? (
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
      <div className="flex gap-3 h-[calc(40%-16px)] min-h-0">
        <div className="flex-1 min-w-0">
          <Agencies
            dataIn={landparcel}
            extractor={officesPageExtractor}
            setAgencyGeom={setExtraAgencyGeom}
            setActiveTableRow={setActiveRow}
            activeRowId={activeRowId}
            draftTable={agencyAreas.draftTable}
            dienststellen={agencyAreas.dienststellen}
            parcelArea={agencyAreas.parcelArea}
          />
        </div>
        <div className="flex-1 min-w-0">
          <AdditionalRole
            dataIn={landparcel}
            extractor={additionalRollExtractor}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Notes dataIn={landparcel} extractor={noteExtractor} />
        </div>
      </div>
    </div>
  );
};

export default Offices;
