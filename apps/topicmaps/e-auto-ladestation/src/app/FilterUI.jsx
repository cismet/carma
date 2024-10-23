import { Button } from 'react-bootstrap';
import GruenerStromFC from './filtercontrols/GruenerStrom';
import OeffnungszeitenFC from './filtercontrols/Oeffnungszeiten';
import OnlineFC from './filtercontrols/Online';
import SchnellladerFC from './filtercontrols/Schnelllader';
import SteckerFC from './filtercontrols/Stecker';
import PieChart from './PieChart';
import { ResponsiveTopicMapContext } from 'react-cismap/contexts/ResponsiveTopicMapContextProvider';

import 'url-search-params-polyfill';
import { useContext } from 'react';

const FilterUI = ({
  filter,
  setFilter,
  featureRenderingOption,
  steckertypes,
}) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const width = windowSize?.width || 500;
  let widePieChartPlaceholder = null;
  let narrowPieChartPlaceholder = null;

  let pieChart = <PieChart />;

  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br /> {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = pieChart;
  }

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td valign="center" style={{ width: '330px' }}>
              <OnlineFC filter={filter} setFilter={setFilter} />
              <OeffnungszeitenFC filter={filter} setFilter={setFilter} />
              <SteckerFC
                steckertypes={steckertypes}
                filter={filter}
                setFilter={setFilter}
              />
              <GruenerStromFC filter={filter} setFilter={setFilter} />
              <SchnellladerFC filter={filter} setFilter={setFilter} />

              <p>
                <Button
                  bsSize="small"
                  onClick={() => {
                    setFilter({
                      nur_online: false,
                      oeffnungszeiten: '*',
                      stecker: undefined,
                      nur_gruener_strom: false,
                      nur_schnelllader: false,
                    });
                  }}
                >
                  Filter zurücksetzen (alle Anlagen anzeigen)
                </Button>
              </p>
            </td>
            {widePieChartPlaceholder}
          </tr>
        </tbody>
      </table>
      {narrowPieChartPlaceholder}
    </div>
  );
};
export default FilterUI;
