import React, { useContext } from "react";
import queryString from "query-string";
import { TopicMapContext } from "../../contexts/TopicMapContextProvider";
import { ResponsiveTopicMapContext } from "../../contexts/ResponsiveTopicMapContextProvider";
import { FeatureCollectionContext } from "../../contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "../../contexts/TopicMapStylingContextProvider";

const Box = ({ defaultContextValues = {} }) => {
  const { history, titleFactory } =
    useContext(TopicMapContext) || defaultContextValues;
  const responsiveTopicMapContext =
    useContext(ResponsiveTopicMapContext) || defaultContextValues;
  const featureCollectionContext =
    useContext(FeatureCollectionContext) || defaultContextValues;
  const topicMapStylingContext =
    useContext(TopicMapStylingContext) || defaultContextValues;

  const width = responsiveTopicMapContext.windowSize?.width || 0;
  let title = null;
  let themenstadtplanDesc = "";
  let titleContent;
  let qTitle = queryString.parse(history.location.search).title;
  if (qTitle !== undefined) {
    if (qTitle === null || qTitle === "") {
      if (titleFactory !== undefined) {
        titleContent = titleFactory({
          featureCollectionContext,
          responsiveTopicMapContext,
          topicMapStylingContext,
        });
      }
    } else {
      themenstadtplanDesc = qTitle;
      titleContent = <div>{themenstadtplanDesc}</div>;
    }
    if (titleContent) {
      title = (
        <table
          style={{
            width: width - 54 - 12 - 38 - 12 + "px",
            height: "30px",
            position: "absolute",
            left: 54,
            top: 12,
            zIndex: 555,
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  textAlign: "center",
                  verticalAlign: "middle",
                  background: "#ffffff",
                  color: "black",
                  opacity: "0.9",
                  paddingLeft: "10px",
                }}
              >
                {titleContent}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }
  }

  return title;
};

export default Box;
