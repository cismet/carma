import ColorHash from "color-hash";

export const getColorForProperties = (properties, poiColors) => {
  let { mainlocationtype, color } = properties;
  let ll = mainlocationtype.lebenslagen;
  //console.log(colorHash.hex("" + JSON.stringify({ll})));
  if (color !== undefined) {
    return color;
  } else if (mainlocationtype.color !== undefined) {
    return mainlocationtype.color;
  } else {
    return getColorFromLebenslagenCombination(
      ll
        .slice()
        .sort(function (a, b) {
          return a.localeCompare(b);
        })
        .join(", "),
      poiColors
    );
  }
};
export const getColorFromLebenslagenCombination = (
  combination,
  poiColors = POI_COLORS
) => {
  // let qColorRules;
  let colorCandidate;
  // let lookup = null;
  try {
    // qColorRules = undefined; //queryString.parse(store.getState().routing.location.search).colorRules;
    // if (qColorRules) {
    //   try {
    //     lookup = JSON.parse(qColorRules);
    //   } catch (error) {
    //     console.error(error);
    //   }
    // }
  } catch (error) {
    //problem dduring colorRulesn override
  }

  colorCandidate = poiColors[combination];
  if (colorCandidate) {
    return colorCandidate;
  } else {
    let colorHash = new ColorHash({ saturation: 0.3 });
    const c = colorHash.hex(combination);
    // console.log(
    //   "Keine vordefinierte Farbe für '" +
    //     combination +
    //     "' vorhanden. (Ersatz wird automatisch erstellt) --> " +
    //     c
    // );
    return c;
  }
  // return "#A83F6A";
};

export let POI_COLORS = {
  "Freizeit, Sport": "#194761",
  Mobilität: "#6BB6D7",
  "Erholung, Religion": "#094409",
  Gesellschaft: "#B0CBEC",
  Religion: "#0D0D0D",
  Gesundheit: "#CB0D0D",
  "Erholung, Freizeit": "#638555",
  Sport: "#0141CF",
  "Freizeit, Kultur": "#B27A08",
  "Gesellschaft, Kultur": "#E26B0A",
  "öffentliche Dienstleistungen": "#417DD4",
  Orientierung: "#BFBFBF",
  Bildung: "#FFC000",
  Stadtbild: "#695656",
  "Gesellschaft, öffentliche Dienstleistungen": "#569AD6",
  "Dienstleistungen, Freizeit": "#26978F",
  Dienstleistungen: "#538DD5",
  "Bildung, Freizeit": "#BBAA1E",
  Kinderbetreuung: "#00A0B0",
};
