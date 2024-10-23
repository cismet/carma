import React, { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
// import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfoPanelSection from "./SecondaryInfoPanelSection";

import { Timeline } from "antd";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faFlagCheckered } from "@fortawesome/free-solid-svg-icons";
import { getSymbolSVGGetter } from "react-cismap/tools/uiHelper";
import "./verlauf.css";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

export default function Verlauf({ revertedOrder }) {
  const { selectedFeature, allFeatures, itemsDictionary } = useContext(
    FeatureCollectionContext
  );

  const { windowSize } = useContext(ResponsiveTopicMapContext);

  const item = selectedFeature?.properties;
  let timeline;

  const routenverlauf4Timeline = [
    {
      key: "start",
      dot: <FontAwesomeIcon icon={faPlay} />,
      // label: "0 m",
      children: "Startpunkt",
    },
  ];
  let maxDotLength = 0;

  let rps;

  if (revertedOrder) {
    rps = (item.routenpunkte || []).slice().reverse(); //cerate a copy first then reverse
  } else {
    rps = item.routenpunkte || [];
  }

  for (const routenpunkt of rps) {
    let dot = [];
    if (routenpunkt.typ === "klimaort") {
      const angebote = itemsDictionary.angeboteInStandorte[routenpunkt.id];
      for (const angebotId of angebote || []) {
        const feature4Punkt = allFeatures.find(
          (f) => f.properties.id === angebotId && f.featuretype === "ort"
        );

        dot.push(
          <span key={"dot." + routenpunkt.id + "." + angebotId}>
            {getSymbolSVGGetter(
              feature4Punkt?.properties?.svgBadge,
              feature4Punkt?.properties?.svgBadgeDimension
            )(24, feature4Punkt?.properties.color, "angebot_" + angebotId)}
          </span>
        );
      }
    } else {
      //handelt zwischenstopps &  pois
      const feature4Punkt = allFeatures.find(
        (f) =>
          f.properties.id === routenpunkt.id &&
          f.featuretype === routenpunkt.typ
      );

      dot = [
        <span key={"dot." + routenpunkt.id}>
          {getSymbolSVGGetter(
            feature4Punkt?.properties?.svgBadge,
            feature4Punkt?.properties?.svgBadgeDimension
          )(
            24,
            feature4Punkt?.properties.color,
            "badgefor_" + routenpunkt.typ + "_" + routenpunkt.id
          )}
        </span>,
      ];
    }

    maxDotLength = Math.max(maxDotLength, dot.length);
    // console.log("yy routenpunkt", routenpunkt, feature4Punkt);

    if (windowSize.width < 500) {
      routenverlauf4Timeline.push({
        key: "routenpunkt." + routenpunkt.id,
        children: (
          <div
            style={{
              _border: "1px solid red",
              paddingLeft: (dot.length - 1) * 12,
            }}
          >
            <b>
              {!revertedOrder &&
                (Math.round(routenpunkt.station / 100) * 100).toLocaleString() +
                  " m"}
              {revertedOrder &&
                (
                  Math.round(routenpunkt.station_reverted / 100) * 100
                ).toLocaleString() + " m"}
            </b>
            {": "}
            {routenpunkt.name}{" "}
          </div>
        ),

        dot,
      });
    } else {
      routenverlauf4Timeline.push({
        key: "routenpunkt." + routenpunkt.id,
        label: (
          <div
            style={{
              paddingRight: ((dot?.length || 1) - 1) * 12,
              whiteSpace: "nowrap",
            }}
          >
            {!revertedOrder &&
              (Math.round(routenpunkt.station / 100) * 100).toLocaleString() +
                " m"}
            {revertedOrder &&
              (
                Math.round(routenpunkt.station_reverted / 100) * 100
              ).toLocaleString() + " m"}
          </div>
        ),
        children: (
          <div style={{ paddingLeft: ((dot?.length || 1) - 1) * 12 }}>
            {routenpunkt.name}
          </div>
        ),
        dot,
      });
    }
  }

  routenverlauf4Timeline.push({
    key: "end",
    dot: <FontAwesomeIcon icon={faFlagCheckered} />,
    children: "Zielpunkt",
  });

  if (windowSize.width < 500) {
    timeline = (
      <div className="left_oriented_timeline_container_without_labels">
        <Timeline
          colorBgContainer="#ff0000"
          mode="left"
          items={routenverlauf4Timeline}
          style={{ padding: 5, paddingLeft: maxDotLength * 12 }}
        />
      </div>
    );
  } else {
    timeline = (
      <div className="left_oriented_timeline_container_with_content_on_both_sides">
        <Timeline mode="left" items={routenverlauf4Timeline} />
      </div>
    );
  }

  return (
    <SecondaryInfoPanelSection
      key="routenverlauf"
      header={
        "Routenverlauf" + (revertedOrder ? " (umgekehrte Reihenfolge)" : "")
      }
      bsStyle="info"
    >
      <div>{timeline}</div>
    </SecondaryInfoPanelSection>
  );
}
