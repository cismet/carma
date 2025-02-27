import React from "react";
import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { getGazData } from "./helper/helper";
import Menu from "./Menu";
import { ehrenAmtClusterIconCreator } from "./helper/styler";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookmark,
  faSquareCheck,
  faSquarePlus,
} from "@fortawesome/free-solid-svg-icons";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { Tooltip } from "antd";
import {
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/ehrenamtskarte";
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";

const Ehrenamtkarte = ({ bookmarks, setBookmarks }) => {
  const {
    setSelectedFeatureByPredicate,
    setClusteringOptions,
    fitBoundsForCollection,
    prev,
    next,
  } = useContext(FeatureCollectionDispatchContext);
  const { setAppMenuVisible, setAppMenuActiveMenuSection } =
    useContext(UIDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filteredItems, shownFeatures } =
    useContext(FeatureCollectionContext);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: ehrenAmtClusterIconCreator,
      });
    }
  }, [markerSymbolSize]);

  const selectedId = selectedFeature?.properties?.id;

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <>
      <TopicMapComponent
        modalMenu={<Menu bookmarks={bookmarks} setBookmarks={setBookmarks} />}
        locatorControl={true}
        applicationMenuTooltipString={<MenuTooltip />}
        infoBox={
          <div className="leaflet-bottom leaflet-right">
            <div className="leaflet-control">
              <div
                style={{
                  opacity: "0.9",
                  backgroundColor: "white",
                  width: "250px",
                  padding: "9px",
                }}
              >
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: "left", verticalAlign: "top" }}>
                        <table style={{ width: "100%" }}>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: "left" }}>
                                <h5>
                                  Angebot Nr. {selectedFeature?.properties?.id}
                                </h5>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <Tooltip
                                  title="Merkliste öffnen"
                                  placement="left"
                                >
                                  <FontAwesomeIcon
                                    icon={faBookmark}
                                    style={{
                                      height: 24,
                                      paddingRight: "2px",
                                      color: "rgb(102, 102, 102)",
                                      cursor: "pointer",
                                    }}
                                    onClick={() => {
                                      setAppMenuVisible(true);
                                      setAppMenuActiveMenuSection("merkliste");
                                    }}
                                  />
                                </Tooltip>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <table style={{ width: "100%" }}>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: "left" }}>
                                <h6>{selectedFeature?.text}</h6>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <Tooltip
                                  title="Angebot merken"
                                  placement="left"
                                >
                                  <FontAwesomeIcon
                                    icon={
                                      bookmarks.includes(selectedId)
                                        ? faSquareCheck
                                        : faSquarePlus
                                    }
                                    style={{ height: 24, cursor: "pointer" }}
                                    onClick={() => {
                                      if (bookmarks.includes(selectedId)) {
                                        setBookmarks((prev) =>
                                          prev.filter((id) => id !== selectedId)
                                        );
                                      } else {
                                        setBookmarks((prev) => [
                                          ...prev,
                                          selectedId,
                                        ]);
                                      }
                                    }}
                                  />
                                </Tooltip>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td />
                      <td
                        style={{ textAlign: "center", verticalAlign: "center" }}
                      >
                        <a
                          onClick={fitBoundsForCollection}
                          style={{ color: "#0078A8" }}
                        >
                          {filteredItems?.length} Angebote in Wuppertal
                        </a>
                      </td>

                      <td />
                    </tr>
                  </tbody>
                </table>
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td
                        style={{ textAlign: "left", verticalAlign: "center" }}
                      >
                        <a title="vorheriger Treffer" onClick={prev}>
                          &lt;&lt;
                        </a>
                      </td>

                      <td
                        style={{ textAlign: "center", verticalAlign: "center" }}
                      >
                        {shownFeatures?.length} Angebote angezeigt
                      </td>

                      <td
                        style={{ textAlign: "right", verticalAlign: "center" }}
                      >
                        <a title="nächster Treffer" onClick={next}>
                          &gt;&gt;
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }
      >
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder={searchTextPlaceholder}
        />
      </div>
    </>
  );
};

export default Ehrenamtkarte;
