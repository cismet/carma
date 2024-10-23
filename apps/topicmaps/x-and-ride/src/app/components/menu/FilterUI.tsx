import { useContext } from 'react';
import { Form, Button } from 'react-bootstrap';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { ResponsiveTopicMapContext } from 'react-cismap/contexts/ResponsiveTopicMapContextProvider';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinusCircle, faParking } from '@fortawesome/free-solid-svg-icons';
import XandRidePieChart from './XandRidePieChart';

const FilterUI = () => {
  const { filterState } = useContext<typeof FeatureCollectionContext>(FeatureCollectionContext);
  const { setFilterState } = useContext<typeof FeatureCollectionDispatchContext>(FeatureCollectionDispatchContext);
  const { windowSize } = useContext<typeof ResponsiveTopicMapContext>(ResponsiveTopicMapContext);

  const width = windowSize?.width || 500;

  let widePieChartPlaceholder: any = null;
  let narrowPieChartPlaceholder: any = null;

  let pieChart = <XandRidePieChart />;

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
            <td style={{ width: '330px', verticalAlign: 'center' }}>
              <Form>
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Umweltzonen
                  {'  '}
                  <FontAwesomeIcon
                    icon={faMinusCircle}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />{' '}
                </label>
                <br />
                <Form.Check
                  readOnly={true}
                  key={'filter.prbr.envzone.within'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.envZoneWithin = true;
                    } else {
                      newFilterState.envZoneWithin = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.envZoneWithin}
                  inline
                  label="innerhalb"
                />

                <br />
                <Form.Check
                  readOnly={true}
                  key={'filter.prbr.envzone.outside'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.envZoneOutside = true;
                    } else {
                      newFilterState.envZoneOutside = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.envZoneOutside}
                  inline
                  label="außerhalb"
                />
              </Form>
              <br />
              <Form>
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Art der Anlage
                  {'  '}
                  <FontAwesomeIcon
                    icon={faParking}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />{' '}
                </label>
                <br />
                <Form.Check
                  readOnly={true}
                  key={'filter.prbr.pandr'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.pandr = true;
                    } else {
                      newFilterState.pandr = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.pandr}
                  inline
                  label="Park+Ride (P+R)"
                />

                <br />
                <Form.Check
                  readOnly={true}
                  key={'filter.prbr.bandr'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.bandr = true;
                    } else {
                      newFilterState.bandr = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.bandr}
                  inline
                  label="Bike+Ride (B+R)"
                />
              </Form>
              <br />
              <br />
              <p>
                <Button
                  onClick={() => {
                    setFilterState({
                      pandr: true,
                      bandr: true,
                      envZoneOutside: true,
                      envZoneWithin: true,
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
