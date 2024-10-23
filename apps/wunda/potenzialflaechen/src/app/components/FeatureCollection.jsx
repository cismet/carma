import area from "@turf/area";
import intersect from "@turf/intersect";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useContext, useEffect } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import { md5ActionFetchDAQ } from "react-cismap/tools/fetching";
import { createFlatbushIndex, findInFlatbush } from "react-cismap/tools/gisHelper";
import { apiUrl, dataDaqKey } from "../App";
import { appKey } from "../PotenzialflaechenOnlineMap";
import convertItemToFeature from "../utils/convertItemToSimpleFeature";
dayjs.extend(customParseFormat);

const FC = ({ jwt, setJWT, setLoginInfo }) => {
  const { zoomToFeature } = useContext(TopicMapDispatchContext);
  const { setItems, setMetaInformation } = useContext(FeatureCollectionDispatchContext);

  useEffect(() => {
    if (jwt !== undefined) {
      md5ActionFetchDAQ(appKey, apiUrl, jwt, dataDaqKey)
        .then(
          (result) => {
            //parse e.g. 2021-06-23 06:51:56.97500
            const time = dayjs(result.time, "YYYY-MM-DD hh:mm:ss").toDate();
            if (!result.data) {
              return;
            }
            //Check for sibblings and add them to the original data
            // console.time("xxx sibblingsCheck");
            const features = [];
            for (const item of result.data) {
              features.push(convertItemToFeature(item));
            }
            const polyIndex = createFlatbushIndex(features);

            let i = 0;
            for (const feature of features) {
              const hits = findInFlatbush(polyIndex, feature, features, (hit) => {
                return hit.id !== feature.id;
              });
              const overlapping = [];
              if (hits.length > 0) {
                const featureArea = area(feature);
                for (const hit of hits) {
                  let intersection, intersectionArea;
                  let intersectionRatio = 1;
                  try {
                    intersection = intersect(feature.geometry, hit.geometry);
                    if (intersection) {
                      intersectionArea = area(intersection);
                    } else {
                      intersectionArea = 0;
                    }
                    intersectionRatio = intersectionArea / featureArea;
                  } catch (e) {
                    console.log("error during intersection ", e);
                    console.log("error during intersection ", intersection);
                  }

                  if (intersectionRatio > 0.1) {
                    overlapping.push({ id: hit.properties.id, kampagne: hit.properties.kampagne });
                  } else {
                    // console.log("no hit for ", hit.text);
                  }
                }
              }

              // result.data[i].geojson = buffered.geometry;
              result.data[i].overlapping = overlapping;
              ++i;
            }
            // console.timeEnd("xxx sibblingsCheck");

            setItems(result.data);
            setMetaInformation({ time });
          },
          (problem) => {
            if (problem.status === 401) {
              setJWT(undefined);
              setLoginInfo({ color: "#F9D423", text: "Bitte melden Sie sich erneut an." });
              setTimeout(() => {
                setLoginInfo();
              }, 2500);
            }
            setItems([]);
            setMetaInformation();
          }
        )
        .catch((e) => {
          console.log("xxx error ", e);
        });
    } else {
      setItems([]);
    }
  }, [jwt, setJWT, setLoginInfo]); // setItems, setMetaInformation swill rerrender too often
  return (
    <FeatureCollection
      featureClickHandler={(event) => {
        event.originalEvent.stopImmediatePropagation();
        const feature = event.target.feature;
        if (feature.selected === true) {
          zoomToFeature(event.target.feature);
        }
        // }
      }}
    />
  );
};

export default FC;
