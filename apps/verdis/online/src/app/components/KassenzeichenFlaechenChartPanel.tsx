import { useSelector } from 'react-redux';
import { PieChart, Pie, Legend, Cell, Tooltip } from 'recharts';
import { getKassenzeichen } from '../../store/slices/kassenzeichen';
import {
  anschlussgradLookupByAbk,
  flaechenartLookupByAbk,
  veranlagungsgrundlage,
} from '../../utils/kassenzeichenHelper';
import { getColorFromFlaechenArt } from '../../utils/kassenzeichenMappingTools';

interface PanelProps {
  orientation: string;
}

const KassenzeichenFlaechenChartPanel = ({ orientation }: PanelProps) => {
  const kassenzeichen = useSelector(getKassenzeichen);

  const styleOverride = {
    marginBottom: '5px',
    width: '100%',
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

  if (orientation === 'vertical') {
    return (
      <div
        style={{
          ...styleOverride,
          minHeight: 20,
          backgroundColor: '#f5f5f5',
          border: '1px solid #e3e3e3',
          padding: 9,
          borderRadius: 3,
          height: 'auto',
        }}
      >
        <h4>
          Veranlagung: {Math.floor(total).toLocaleString('de-DE')} m&sup2;
        </h4>
        <PieChart width={210} height={240}>
          <Pie
            data={statsFAData}
            cx={120}
            cy={80}
            innerRadius={20}
            outerRadius={80}
            dataKey="value"
          >
            {statsFAData.map((entry) => {
              return (
                <Cell
                  key={'color.for.' + entry.name}
                  fill={getColorFromFlaechenArt(entry.name)}
                />
              );
            })}
          </Pie>
          <Legend />
          <Tooltip
            formatter={(value: number) =>
              Math.floor(value).toLocaleString('de-DE') + ' m²'
            }
          />
        </PieChart>
      </div>
    );
  } else {
    return (
      <div style={styleOverride}>
        <h4>Statistik: {total.toLocaleString('de-DE')} m&sup2;</h4>
        <PieChart width={140} height={100}>
          <Pie
            data={statsFAData}
            cx={85}
            cy={45}
            innerRadius={20}
            outerRadius={45}
            dataKey="value"
          >
            {statsFAData.map((entry) => {
              return (
                <Cell
                  key={'color.for.' + entry.name}
                  fill={getColorFromFlaechenArt(entry.name)}
                />
              );
            })}
          </Pie>
          <Tooltip
            formatter={(value) => value.toLocaleString('de-DE') + ' m²'}
          />
        </PieChart>
      </div>
    );
  }
};

export default KassenzeichenFlaechenChartPanel;
