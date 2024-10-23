import React, { useContext, useState } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import Footer from "./Footer";
import { getWegeartIcon } from "../helper/iconFactory";
import { Button, Descriptions } from "antd";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import ElevationChart from "./ElevationChart";
import Verlauf from "./Verlauf";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

const productionMode = process.env.NODE_ENV === "production";

const InfoPanel = () => {
  const { selectedFeature } = useContext(FeatureCollectionContext);
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const [revertedOrder, setRevertedOrder] = useState(false);
  const urlPrefix = window.location.origin + window.location.pathname;

  const item = selectedFeature?.properties;

  let iconV = getWegeartIcon(item?.wegeart);

  const subsections = [];

  subsections.push(
    <ElevationChart
      key={"ElevationChart" + item.id + "." + windowSize.width}
      revertedOrder={revertedOrder}
    />,
  );

  subsections.push(
    <Verlauf
      key={"VerlaufElement" + item.id + "." + windowSize.width}
      revertedOrder={revertedOrder}
    />,
  );
  if (!productionMode) {
    subsections.push(
      <SecondaryInfoPanelSection
        key="json"
        header="Rohdaten"
        bsStyle="default"
        collapsedOnStart={true}
      >
        <pre>{JSON.stringify(item, null, 2)}</pre>
      </SecondaryInfoPanelSection>,
    );
  }
  let text;
  if (item?.beschreibung) {
    text = item.beschreibung.split("\n").map((item, key) => {
      return (
        <span key={key}>
          {item}
          <br />
        </span>
      );
    });
  }
  return (
    <SecondaryInfo
      titleIconName="info-circle"
      title={
        <span>
          Klimaroute: {item.name} <FontAwesomeIcon icon={iconV} />{" "}
        </span>
      }
      mainSection={
        <div
          style={{
            width: "100%",
            fontSize: "115%",
            padding: "10px",
          }}
        >
          {item.beschreibung && <p>{text}</p>}
          <Descriptions
            bordered
            column={{
              xxl: 3,
              xl: 3,
              lg: 3,
              md: 1,
              sm: 1,
              xs: 1,
            }}
          >
            <Descriptions.Item label="Dauer">
              <span style={{ whiteSpace: "nowrap" }}>{item.dauer} Stunden</span>
            </Descriptions.Item>
            <Descriptions.Item label="Länge">
              <span style={{ whiteSpace: "nowrap" }}>{item.distanz} km</span>
            </Descriptions.Item>
            <Descriptions.Item label="Schwierigkeitsgrad">
              <span style={{ whiteSpace: "nowrap" }}>
                {item.schwierigkeitsgrad}
              </span>
            </Descriptions.Item>
          </Descriptions>
          <div style={{ padding: 20, paddingLeft: 0 }}>
            <span>Routeninformation in Zusammenarbeit mit </span>
            <a target="komoot" href={item.url}>
              <img
                height="30"
                alt="Komoot"
                src={urlPrefix + "images/logo_komoot_green_h30.png"}
                // src="/logo_komoot_green_RGB_v2-1.svg"
              />
            </a>
          </div>
          {!revertedOrder && (
            <Button
              onClick={() => {
                setRevertedOrder(true);
              }}
            >
              umgekehrte Reihenfolge anzeigen
            </Button>
          )}
          {revertedOrder && (
            <Button
              onClick={() => {
                setRevertedOrder(false);
              }}
            >
              ursprüngliche Reihenfolge anzeigen{" "}
            </Button>
          )}
        </div>
      }
      footer={<Footer />}
      subSections={subsections}
    />
  );
};
export default InfoPanel;
