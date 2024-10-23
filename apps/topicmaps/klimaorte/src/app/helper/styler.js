import gtmStyler from "react-cismap/topicmaps/generic/GTMStyler";
import { appModes } from "./modeParser";
import Color from "color";

const selectionColor = new Color("#2664D8");
const getKlimaOrtkarteStyler = (
  svgSize = 24,
  colorizer = (props) => props.color,
  appMode = appModes.ORTE,
  secondarySelection
) => {
  const styler = (feature) => {
    let returningStyle;
    if (feature === undefined) {
      console.log("returned style empty");
      return {};
    }
    if (appMode === appModes.ORTE) {
      const style = gtmStyler(svgSize, colorizer, appMode)(feature);
      style.color = new Color(colorizer(feature.properties));

      style.fillColor = style.color.lighten(0.5);
      // console.log("returned style 0", style);
      returningStyle = style;
    } else {
      //in ROUTEN Mode
      let color = getColorConsideringSeondarySelection(
        feature.properties,
        secondarySelection,
        feature.geometry
      );
      let radius = svgSize / 2; //needed for the Tooltip Positioning

      if (feature.geometry.type !== "Point") {
        if (feature.selected === true) {
          color = selectionColor;
          const style = {
            radius,
            fillColor: color,
            color: color.darken(0.01),
            opacity: 1,
            fillOpacity: 0.8,

            weight: 3,
          };
          // console.log("returned style 1", style);

          returningStyle = style;
        } else {
          let style;
          if (feature.properties.typ === "route") {
            style = {
              radius,
              fillColor: color,
              color: color.darken(0.2),
              opacity: 1,
              fillOpacity: 0.8,
              weight: 3,
            };
          } else if (feature.properties.typ === "blickfeld") {
            style = {
              radius,
              fillColor: color,
              color: color,
              opacity: 0.8,
              fillOpacity: 0.8,

              weight: 0,
            };
          } else if (feature.properties.typ === "ort") {
            style = gtmStyler(svgSize, () => color, appMode)(feature);
            style.fillColor = color;
            style.color = color.darken(0.1);
            returningStyle = style;
          } else if (feature.properties.typ === "zwischenstopp") {
            style = gtmStyler(svgSize, () => color, appMode)(feature);
            style.fillColor = color;
            style.color = color.darken(0.1);
            returningStyle = style;
          } else {
            // console.log("what else ", feature);
          }
          // console.log("returned style 2", style);

          returningStyle = style;
        }
      } else {
        const style = gtmStyler(svgSize, () => color, appMode)(feature);

        returningStyle = style;
      }
    }

    if (returningStyle === undefined) {
      console.log("xxx no returning style", feature);
    }

    return returningStyle;
  };
  return styler;
};

export default getKlimaOrtkarteStyler;
const lightGrey = new Color("#D8D8D8");
export const getColorConsideringSeondarySelection = (
  props,
  secondarySelection,
  geom
) => {
  let color = new Color("red");
  if (props.typ === "route") {
    color = new Color("#92BE4D");
    if (secondarySelection?.id !== props.id) {
      color = color.grayscale();
    }
  } else if (props.typ === "ort") {
    color = new Color(props.color);
    if (
      props.routen &&
      props.routen.filter((r) => r.id === secondarySelection?.id).length === 0
    ) {
      if (geom && geom.type === "Polygon") {
        color = lightGrey;
      } else {
        color = color.grayscale();
      }
    }
  } else if (props.typ === "aussichtspunkt") {
    //aussichtspunkt
    color = new Color("#655756");
    if (
      props.routen &&
      props.routen.filter((r) => r.id === secondarySelection?.id).length === 0
    ) {
      color = color.grayscale();
    }
  } else if (props.typ === "blickfeld") {
    color = new Color("#00000040");
  } else if (props.typ === "poi") {
    color = new Color(props.color);
    if (
      props.routen &&
      props.routen.filter((r) => r.id === secondarySelection?.id).length === 0
    ) {
      if (geom && geom.type === "Polygon") {
        color = lightGrey;
      } else {
        color = color.grayscale();
      }
    }
  } else if (props.typ === "zwischenstopp") {
    color = new Color(props.color);
    if (
      props.routen &&
      props.routen.filter((r) => r.id === secondarySelection?.id).length === 0
    ) {
      if (geom && geom.type === "Polygon") {
        color = lightGrey;
      } else {
        color = color.grayscale();
      }
    }
  }
  return color;
};
