import { useSelector } from "react-redux";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { getKassenzeichen } from "../../store/slices/kassenzeichen";
import {
  anschlussgradLookupByAbk,
  flaechenartLookupByAbk,
  getCRsForFlaeche,
  getMergedFlaeche,
  veranlagungsgrundlage,
} from "../../utils/kassenzeichenHelper";
import { getColorFromFlaechenArt } from "../../utils/kassenzeichenMappingTools";
import { panelTitles } from "@carma-collab/wuppertal/verdis-online";
import { getUiState } from "../../store/slices/ui";

interface PanelProps {
  orientation: string;
}

const KassenzeichenFlaechenChartPanel = ({ orientation }: PanelProps) => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const uiState = useSelector(getUiState);

  const styleOverride = {
    marginBottom: "5px",
    width: "100%",
  };

  const getCorrectArea = (flaeche) => {
    if (flaeche.anteil !== undefined && flaeche.anteil !== null) {
      return flaeche.anteil;
    } else {
      return flaeche.flaecheninfo.groesse_korrektur;
    }
  };

  const statsFA = new Map();
  let total = 0;
  if (kassenzeichen.flaechen) {
    kassenzeichen.flaechen.forEach((flaeche_) => {
      let flaeche = flaeche_;

      if (uiState.changeRequestsEditMode === true) {
        flaeche = getMergedFlaeche(
          flaeche_,
          getCRsForFlaeche(kassenzeichen, flaeche_)
        );
      } else {
        flaeche = flaeche_;
      }
      const flaechenartId =
        flaeche.flaecheninfo.flaechenart.id ||
        flaechenartLookupByAbk[flaeche.flaecheninfo.flaechenart.art_abkuerzung];
      const anschlussgradId =
        flaeche.flaecheninfo.anschlussgrad.id ||
        anschlussgradLookupByAbk[
          flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung
        ];
      // console.log('flaeche', flaeche.flaecheninfo.anschlussgrad);
      let factor;
      for (const rule of veranlagungsgrundlage) {
        if (
          rule.flaechenart === flaechenartId &&
          rule.anschlussgrad === anschlussgradId
        ) {
          factor = rule.veranlagungsschluessel;
          break;
        }
      }
      let sumFA = statsFA.get(flaeche.flaecheninfo.flaechenart.art);
      if (sumFA) {
        statsFA.set(
          flaeche.flaecheninfo.flaechenart.art,
          getCorrectArea(flaeche) * factor + sumFA
        );
      } else {
        statsFA.set(
          flaeche.flaecheninfo.flaechenart.art,
          getCorrectArea(flaeche) * factor
        );
      }
      total += getCorrectArea(flaeche) * factor;
    });
  }
  const statsFAData: any = [];
  for (let key of statsFA.keys()) {
    const o = {
      name: key,
      value: statsFA.get(key),
    };
    statsFAData.push(o);
  }

  const formatArea = (value: number) =>
    Math.floor(value).toLocaleString("de-DE") + " m²";

  const legend = (
    <ul
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        margin: 0,
        padding: 0,
        listStyle: "none",
        fontSize: 14,
      }}
    >
      {statsFAData.map((entry) => (
        <li
          key={"legend.for." + entry.name}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            padding: "2px 0",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: getColorFromFlaechenArt(entry.name),
            }}
          />
          <span style={{ flex: "1 1 auto", minWidth: 0 }}>{entry.name}</span>
          <span
            style={{
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {formatArea(entry.value)}
          </span>
        </li>
      ))}
    </ul>
  );

  if (orientation === "vertical") {
    return (
      <div
        className="gradient-bg-for-cards"
        style={{
          ...styleOverride,
          minHeight: 20,
          backgroundColor: "#f5f5f5",
          border: "1px solid #e3e3e3",
          padding: 9,
          borderRadius: 3,
          height: "auto",
        }}
      >
        <h4>
          {panelTitles.kassenzeichenTitleChart} {formatArea(total)}
        </h4>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PieChart
            width={160}
            height={160}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Pie
              data={statsFAData}
              cx="50%"
              cy="50%"
              innerRadius={20}
              outerRadius={78}
              dataKey="value"
            >
              {statsFAData.map((entry) => (
                <Cell
                  key={"color.for." + entry.name}
                  fill={getColorFromFlaechenArt(entry.name)}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatArea(value)} />
          </PieChart>
        </div>
        <div style={{ marginTop: 8 }}>{legend}</div>
      </div>
    );
  } else {
    return (
      <div
        className="gradient-bg-for-cards"
        style={{
          ...styleOverride,
          backgroundColor: "#f5f5f5",
          border: "1px solid #e3e3e3",
          padding: 9,
          borderRadius: 3,
        }}
      >
        <h4>
          {panelTitles.kassenzeichenTitleChart} {formatArea(total)}
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PieChart
            width={120}
            height={120}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            style={{ flexShrink: 0 }}
          >
            <Pie
              data={statsFAData}
              cx="50%"
              cy="50%"
              innerRadius={22}
              outerRadius={58}
              dataKey="value"
              isAnimationActive={false}
            >
              {statsFAData.map((entry) => (
                <Cell
                  key={"color.for." + entry.name}
                  fill={getColorFromFlaechenArt(entry.name)}
                />
              ))}
            </Pie>
          </PieChart>
          {legend}
        </div>
      </div>
    );
  }
};

export default KassenzeichenFlaechenChartPanel;
