import { constants as kitasConstants } from "./helper/constants";
import { getColorForProperties } from "./helper/styler";
import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { useSelector } from "react-redux";
import { getFeatureRenderingOption } from "./store/slices/ui";
import ReactChartkick, { PieChart } from "react-chartkick";
import { Chart } from "chart.js";

ReactChartkick.addAdapter(Chart);

const KitasPieChart = ({ visible = true }) => {
  const { filteredItems } = useContext(FeatureCollectionContext);
  const renderingOption = useSelector(getFeatureRenderingOption);

  if (visible && filteredItems) {
    let stats = {};
    let colormodel = {};
    let piechartData = [];
    let piechartColor = [];

    if (renderingOption === kitasConstants.FEATURE_RENDERING_BY_PROFIL) {
      stats["Kita mit Inklusionsschwerpunkt"] = 0;
      stats["Kita"] = 0;
      for (let kita of filteredItems) {
        if (kita.plaetze_fuer_behinderte === true) {
          stats["Kita mit Inklusionsschwerpunkt"] += 1;
          if (stats["Kita mit Inklusionsschwerpunkt"] === 1) {
            colormodel["Kita mit Inklusionsschwerpunkt"] =
              getColorForProperties(kita, renderingOption);
          }
        } else {
          stats["Kita"] += 1;
          if (stats["Kita"] === 1) {
            colormodel["Kita"] = getColorForProperties(kita, renderingOption);
          }
        }
      }
    } else {
      for (let kita of filteredItems) {
        const text =
          kitasConstants.TRAEGERTEXT[
            kitasConstants.TRAEGERTYP[kita.traegertyp]
          ];
        if (stats[text] === undefined) {
          stats[text] = 1;
          colormodel[text] = getColorForProperties(kita, renderingOption);
        } else {
          stats[text] += 1;
        }
      }
    }
    for (let key in stats) {
      piechartData.push([key, stats[key]]);
      piechartColor.push(colormodel[key]);
    }

    return (
      <td
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignContent: "center",
          justifyContent: "center",
        }}
      >
        <PieChart
          data={piechartData}
          donut={true}
          title="Verteilung"
          legend={false}
          colors={piechartColor}
        />
      </td>
    );
  } else {
    return null;
  }
};

export default KitasPieChart;
