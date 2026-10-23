import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "antd";
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
import { getBoundsForFeatureArray } from "../core/tools/mappingTools";
import AreaMap from "../components/editing/AreaMap";
import AreaSummary from "../components/editing/AreaSummary";
import useAgencyAreas from "../components/offices/useAgencyAreas";
import { getLastLibreMapView } from "../core/tools/libreMapRegistry";
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
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const geometry = useSelector(getGeometry);
  const [extraAgencyGeom, setExtraAgencyGeom] = useState(null);
  const [activeRowId, setActiveRow] = useState(null);
  const agencyAreas = useAgencyAreas();
  const dispatch = useDispatch();
  const mountedRef = useRef(false);
  const editStartView = useMemo(
    () =>
      agencyAreas.editable && mountedRef.current ? getLastLibreMapView() : null,
    [agencyAreas.editable]
  );

  useEffect(() => {
    mountedRef.current = true;
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

  const [editMapReady, setEditMapReady] = useState(false);
  useEffect(() => {
    setEditMapReady(false);
  }, [agencyAreas.editable]);

  return (
    <div
      style={{ ...storyStyle, height }}
      className="offices-page flex flex-col gap-4"
    >
      <div className="h-[60%] min-h-0 relative">
        <div
          className="h-full"
          style={{
            visibility:
              agencyAreas.editable && editMapReady ? "hidden" : "visible",
          }}
        >
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
        {agencyAreas.editable && (
          <div
            className="absolute inset-0"
            style={{ visibility: editMapReady ? "visible" : "hidden" }}
          >
            <Card
              size="small"
              title={
                <div className="flex items-center">
                  <span className="mr-6">Karte</span>
                  {agencyAreas.rows.length >= 2 && (
                    <div className="font-normal py-1">
                      <AreaSummary
                        parcelArea={agencyAreas.parcelArea}
                        rows={agencyAreas.rows}
                        style={{ paddingTop: 2, paddingBottom: 2 }}
                      />
                    </div>
                  )}
                </div>
              }
              style={{ width: "100%", height: "100%" }}
              bodyStyle={{
                padding: 5,
                height: "calc(100% - 37px)",
                display: "flex",
              }}
              headStyle={{ backgroundColor: "white" }}
              type="inner"
              className="overflow-hidden shadow-md"
            >
              <AreaMap
                parcelGeometry={agencyAreas.parcelGeometry}
                style={{
                  flex: "none",
                  width: "calc(100% + 2px)",
                  height: "calc(100% + 2px)",
                  minHeight: 0,
                  border: "none",
                  borderRadius: 0,
                }}
                initialView={editStartView}
                fitPadding={20}
                parcelFillOpacity={0.6}
                onReady={() => setEditMapReady(true)}
                {...agencyAreas.mapProps}
              />
            </Card>
          </div>
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
