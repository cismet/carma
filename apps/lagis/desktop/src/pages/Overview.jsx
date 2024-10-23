import React, { useState } from "react";
import Map from "../components/commons/Map";
import Offices from "../components/overview/Offices";
import Rent from "../components/overview/Rent";
import Rights from "../components/overview/Rights";
import Usage from "../components/overview/Usage";
import Operations from "../components/overview/Operations";
import History from "../components/overview/History";
import Transaction from "../components/overview/Transaction";
import DMS from "../components/overview/DMS";
import { useSelector, useDispatch } from "react-redux";
import {
  getGemarkungen,
  getflurstuecke,
  getLandParcels,
} from "../store/slices/landParcels";
import { useEffect } from "react";
import {
  getGeometry,
  getHistory,
  getLandparcel,
  getMipa,
  getRebe,
} from "../store/slices/lagis";
import {
  dmsExtractor,
  historyExtractor,
  mipaExtractor,
  operationExtractor,
  rebeExtractor,
  transactionExtractor,
  usageExtractor,
} from "../core/extractors/overviewExtractors";
import { mapExtractor } from "../core/extractors/commonExtractors";
import { officesExtractor } from "../core/extractors/overviewExtractors";
import { useNavigate, useSearchParams } from "react-router-dom";
import { convertLatLngToXY } from "../core/tools/mappingTools";
import { getFstckForPoint } from "../store/slices/search";
import { setMapLoading } from "../store/slices/ui";
const Overview = ({ width = "100%", height = "100%", inStory = false }) => {
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
  const [urlParams, setUrlParams] = useSearchParams();
  const [parametersForLink, setParametersForLink] = useState();
  const navigate = useNavigate();
  const mipa = useSelector(getMipa);
  const rebe = useSelector(getRebe);
  const { landParcels } = useSelector(getLandParcels);

  useEffect(() => {
    dispatch(getGemarkungen(navigate));
    if (!landParcels) {
      dispatch(getflurstuecke(navigate));
    }
  }, []);
  useEffect(() => {
    const fromUrl = {
      gem: urlParams.get("gem") || undefined,
      flur: urlParams.get("flur") || undefined,
      fstck: urlParams.get("fstck") || undefined,
    };
    setParametersForLink(fromUrl);
  }, [urlParams]);

  const landparcel = useSelector(getLandparcel);
  const history = useSelector(getHistory);
  const geometry = useSelector(getGeometry);
  return (
    <div
      style={{
        ...storyStyle,
      }}
      className="h-full overflow-clip max-h[calc(100%-30px)]"
    >
      <div className="flex gap-2 w-full  h-[calc(100%)]">
        <div className="w-1/2 gap-2 overflow-auto">
          <div className="grid grid-cols-2 gap-2 min-w-[430px] h-[calc(100%-3px)]">
            <Offices
              dataIn={landparcel}
              extractor={officesExtractor}
              parametersForLink={parametersForLink}
            />
            <Rent
              dataIn={{ mipa, landparcel }}
              extractor={mipaExtractor}
              parametersForLink={parametersForLink}
            />
            <Rights
              dataIn={{ rebe, landparcel }}
              extractor={rebeExtractor}
              parametersForLink={parametersForLink}
            />
            <Usage
              dataIn={landparcel}
              extractor={usageExtractor}
              parametersForLink={parametersForLink}
            />
            <Operations
              dataIn={landparcel}
              extractor={operationExtractor}
              parametersForLink={parametersForLink}
            />
            <History
              dataIn={history}
              extractor={historyExtractor}
              parametersForLink={parametersForLink}
            />
            <Transaction
              dataIn={landparcel}
              extractor={transactionExtractor}
              parametersForLink={parametersForLink}
            />
            <DMS
              dataIn={landparcel}
              extractor={dmsExtractor}
              parametersForLink={parametersForLink}
            />
          </div>
        </div>
        <div className="w-1/2 h-[calc(100%-3px)]">
          <Map
            width={100}
            height={100}
            dataIn={{
              landparcel,
              geometry,
              ondblclick: (event) => {
                dispatch(setMapLoading(true));
                const xy = convertLatLngToXY(event.latlng);
                dispatch(
                  getFstckForPoint(xy[0], xy[1], () => {
                    setTimeout(() => {
                      dispatch(setMapLoading(false));
                    }, 100);
                  })
                );
              },
            }}
            extractor={mapExtractor}
          />
        </div>
      </div>
    </div>
  );
};

export default Overview;
