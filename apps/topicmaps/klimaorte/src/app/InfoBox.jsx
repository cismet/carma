import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import { appModes } from "./helper/modeParser";
import { getColorConsideringSeondarySelection } from "./helper/styler";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { InfoBoxTextContent } from "@carma-collab/wuppertal/klimaorte";
const InfoBox = (props) => {
  let boxConfig = null;
  let secondaryInfoBoxElements = [];

  const featureCollectionContext = useContext(FeatureCollectionContext);
  const { setSelectedFeatureByPredicate, fitBoundsForCollection } = useContext(
    FeatureCollectionDispatchContext,
  );

  const {
    shownFeatures,
    itemsDictionary,
    selectedFeature,
    secondarySelection,
    allFeatures,
  } = featureCollectionContext;
  const { responsiveState, gap, windowSize, infoBoxPixelWidth } = useContext(
    ResponsiveTopicMapContext,
  );

  const overlappingHeaders = [];
  let counter = 1;
  const isActive = () => true; // //itemFilterFunction({ filterState });
  let actualWidth = 500;

  if (responsiveState === "normal") {
    actualWidth = infoBoxPixelWidth;
  } else if (responsiveState === "small") {
    actualWidth = windowSize.width - gap;
  }

  if (props.appMode === appModes.ROUTEN) {
    if (selectedFeature?.properties?.routen) {
      for (const route of selectedFeature.properties.routen) {
        if (isActive(route)) {
          overlappingHeaders.push(
            <div
              key={"overlapping." + route.name}
              style={{
                width: actualWidth,
                paddingBottom: 3,
                paddingLeft:
                  (selectedFeature.properties.routen.length - counter + 1) * 10,
                cursor: "pointer", //is a hand
              }}
              onClick={() => {
                console.log(
                  "setSelectedFeatureByPredicate",
                  setSelectedFeatureByPredicate,
                );

                setSelectedFeatureByPredicate(
                  (feature) => {
                    return (
                      feature?.properties?.typ === "route" &&
                      feature?.properties?.id === route.id
                    );
                  },
                  (foundSomething) => {
                    if (!foundSomething) {
                      fitBoundsForCollection(
                        allFeatures.filter(
                          (f) =>
                            f.properties.typ === "route" &&
                            f.properties.id === route.id,
                        ),
                      );
                      setTimeout(() => {
                        setSelectedFeatureByPredicate((feature) => {
                          return (
                            feature?.properties?.typ === "route" &&
                            feature?.properties?.id === route.id
                          );
                        });
                      }, 200);
                    }
                  },
                );
              }}
            >
              <InfoBoxHeader
                headerColor={
                  getColorConsideringSeondarySelection(
                    route,
                    secondarySelection,
                  ).string() || "grey"
                }
                content={"Klimaroute " + route.name}
              ></InfoBoxHeader>
            </div>,
          );
        }
        counter++;
      }
    }
    let config;

    const NEXT = 1;
    const PREV = -1;
    const select = (direction, order, getType, getId = (obj) => obj) => {
      console.log("select");

      const orderNum = [];
      for (const obj of order) {
        orderNum.push({ typ: getType(obj), id: getId(obj).toString() });
      }
      const currentTarget = {
        typ: selectedFeature?.properties?.typ,
        id: selectedFeature?.properties?.id.toString(),
      };

      const doubleOrder = [...orderNum, ...orderNum];
      let nextIndexOfOrder;
      let orderCounter = 0;
      const orderIndexOfSelectedFeature = doubleOrder.findIndex(
        (tester) =>
          currentTarget.typ === tester.typ && currentTarget.id === tester.id,
      );
      let hitIndex;
      //prepare the next id
      if (direction === NEXT) {
        nextIndexOfOrder = orderIndexOfSelectedFeature;
      } else {
        nextIndexOfOrder = orderIndexOfSelectedFeature + order.length;
      }
      while (hitIndex === undefined && orderCounter < orderNum.length) {
        if (direction === NEXT) {
          nextIndexOfOrder = nextIndexOfOrder + 1;
        } else {
          nextIndexOfOrder = nextIndexOfOrder - 1;
        }
        let index = 0;
        let counter = 0;
        while (counter < shownFeatures.length) {
          if (
            shownFeatures[index].properties.typ ===
              doubleOrder[nextIndexOfOrder].typ &&
            shownFeatures[index].properties.id.toString() ===
              doubleOrder[nextIndexOfOrder].id
          ) {
            hitIndex = nextIndexOfOrder;
            break;
          }
          index++;
          if (index >= shownFeatures.length) {
            index = 0;
          }
          counter++;
        }
        orderCounter++;
      }
      if (hitIndex !== undefined) {
        setSelectedFeatureByPredicate((feature) => {
          console.log(
            "setSelectedFeatureByPredicate",
            feature?.properties?.id.toString(),
            doubleOrder[hitIndex].id,
            feature?.properties?.typ === doubleOrder[hitIndex].typ &&
              feature?.properties?.id.toString() === doubleOrder[hitIndex].id,
          );

          return (
            feature?.properties?.typ === doubleOrder[hitIndex].typ &&
            feature?.properties?.id.toString() === doubleOrder[hitIndex].id
          );
        });
      }
    };

    if (selectedFeature?.properties?.typ === "route") {
      //if a route is the selected element
      config = {
        displaySecondaryInfoAction: props.moreDataAvailable,
        city: "Wuppertal",
        navigator: {
          noun: {
            singular: "Klimaroute",
            plural: "Klimarouten",
          },
        },
        noCurrentFeatureTitle: "Keine Klimarouten gefunden",
        noCurrentFeatureContent: <InfoBoxTextContent />,
        getTotalNumberOfItems: () => {
          return Object.values(itemsDictionary.routen).length;
        },
        getNumberOfShownFeatures: (featureCollection) =>
          featureCollection.filter(
            (feature) =>
              feature.preventSelection !== true &&
              feature.properties.typ === "route",
          ).length,
        next: () => {
          select(NEXT, Object.keys(itemsDictionary.routen), () => "route");
        },
        previous: () => {
          select(PREV, Object.keys(itemsDictionary.routen), () => "route");
        },
        fitAll: () => {
          fitBoundsForCollection(
            allFeatures.filter((f) => f.properties.typ === "route"),
          );
        },
      };
    } else {
      //if a ort or aussichtspunkt is the selected element
      config = {
        displaySecondaryInfoAction: props.moreDataAvailable,
        city: "Wuppertal",
        navigator: {
          noun: {
            singular: "Station auf dieser Route",
            plural: "Stationen auf dieser Route",
          },
        },
        noCurrentFeatureTitle: "Keine Stationen gefunden",
        noCurrentFeatureContent: <InfoBoxTextContent />,

        getTotalNumberOfItems: (items) => {
          if (secondarySelection?.id) {
            return itemsDictionary.stationenInRouten[secondarySelection.id]
              .length;
          } else {
            return "";
          }
        },

        getNumberOfShownFeatures: (featureCollection) => {
          if (featureCollection && secondarySelection?.id) {
            const featuresThatCount = featureCollection.filter(
              (feature) =>
                feature.preventSelection !== true &&
                feature.properties.routen &&
                feature.properties.routen.filter(
                  (r) => r.id === secondarySelection.id,
                ).length > 0,
            );

            return featuresThatCount.length;
          } else {
            return "";
          }
        },
        next: () => {
          select(
            NEXT,
            itemsDictionary.stationenInRouten[secondarySelection.id],
            (obj) => {
              if (obj.typ === "angebot") {
                return "ort";
              } else {
                return obj.typ;
              }
            },
            (obj) => obj.id,
          );
        },
        previous: () => {
          select(
            PREV,
            itemsDictionary.stationenInRouten[secondarySelection.id],
            (obj) => {
              if (obj.typ === "angebot") {
                return "ort";
              } else {
                return obj.typ;
              }
            },

            (obj) => obj.id,
          );
        },
        fitAll: () => {
          fitBoundsForCollection(
            allFeatures.filter(
              (f) =>
                f.properties.typ === "ort" &&
                itemsDictionary.stationenInRouten[
                  secondarySelection.id
                ].findIndex(
                  (agb) => agb.id === f.properties.id && agb.typ === "angebot",
                ) > -1,
            ),
          );
        },
      };
    }

    boxConfig = config;
    secondaryInfoBoxElements = [
      overlappingHeaders,
      ...(props.secondaryInfoBoxElements || []),
    ];
  } else {
    boxConfig = {
      displaySecondaryInfoAction: props.moreDataAvailable,
      city: "Wuppertal",
      navigator: {
        noun: {
          singular: "Klimaort",
          plural: "Klimaorte",
        },
      },
      noCurrentFeatureTitle: "Keine Klimaorte gefunden",
      noCurrentFeatureContent: <InfoBoxTextContent />,
    };
  }
  return (
    <GenericInfoBoxFromFeature
      {...props}
      config={boxConfig}
      secondaryInfoBoxElements={secondaryInfoBoxElements}
    />
  );
};

export default InfoBox;
