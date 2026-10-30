import { useEffect, useState } from "react";
import Map from "../components/commons/Map";
import Agencies from "../components/offices/Agencies";
import AdditionalRole from "../components/offices/AdditionalRole";
import Notes from "../components/offices/Notes";
import { useSelector, useDispatch } from "react-redux";
import { getLandparcel, getGeometry } from "../store/slices/lagis";
import {
  noteExtractor,
  additionalRollExtractor,
  officesPageExtractor,
} from "../core/extractors/officesPageExtractor";
import { mapOfficesExtractor } from "../core/extractors/officesPageExtractor";
import { mapExtractor } from "../core/extractors/commonExtractors";
import AreaSummary from "../components/editing/AreaSummary";
import useAgencyAreas from "../components/offices/useAgencyAreas";
import { setHasFittedBounds } from "../store/slices/mapping";

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
  const landparcel = useSelector(getLandparcel);
  const geometry = useSelector(getGeometry);
  const [extraAgencyGeom, setExtraAgencyGeom] = useState(null);
  const [activeRowId, setActiveRow] = useState(null);
  const agencyAreas = useAgencyAreas();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setHasFittedBounds(false));
  }, []);

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

  const editing = agencyAreas.editable
    ? { ...agencyAreas.mapProps, parcelGeometry: agencyAreas.parcelGeometry }
    : undefined;
  const areaSummary = agencyAreas.editable && agencyAreas.rows.length >= 2 && (
    <span className="inline-block font-normal py-1">
      <AreaSummary
        parcelArea={agencyAreas.parcelArea}
        rows={agencyAreas.rows}
        style={{ paddingTop: 2, paddingBottom: 2 }}
      />
    </span>
  );

  return (
    <div
      style={{ ...storyStyle, height }}
      className="offices-page flex flex-col gap-4"
    >
      <div className="h-[60%] min-h-0">
        {extraAgencyGeom ? (
          <Map
            width={width}
            height={height}
            dataIn={{ landparcel, extraAgencyGeom, activeRowId }}
            extractor={mapOfficesExtractor}
            onClickHandler={mapClickHandler}
            measuring={false}
            editing={editing}
            titleExtra={areaSummary || undefined}
          />
        ) : (
          <Map
            width={width}
            height={height}
            dataIn={{ landparcel, geometry, colorByStatus: true }}
            extractor={mapExtractor}
            measuring={false}
            editing={editing}
            titleExtra={areaSummary || undefined}
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
