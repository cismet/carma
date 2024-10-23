import React, { useContext } from 'react';
import { Button, Form } from 'react-bootstrap';

import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { ResponsiveTopicMapContext } from 'react-cismap/contexts/ResponsiveTopicMapContextProvider';
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';

import 'url-search-params-polyfill';
import EBikesPieChart from './EBikesPieChart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBicycle,
  faChargingStation,
  faClock,
  faLeaf,
  faToggleOn,
} from '@fortawesome/free-solid-svg-icons';

const FilterUI = () => {
  const { filterState } = useContext<typeof FeatureCollectionContext>(FeatureCollectionContext);
  const { setFilterState } = useContext<typeof FeatureCollectionDispatchContext>(FeatureCollectionDispatchContext);
  const { windowSize } = useContext<typeof ResponsiveTopicMapContext>(ResponsiveTopicMapContext);
  const { additionalStylingInfo } = useContext<typeof TopicMapStylingContext>(TopicMapStylingContext);

  const width = windowSize?.width || 500;

  let widePieChartPlaceholder: any = null;
  let narrowPieChartPlaceholder: any = null;

  let pieChart = <EBikesPieChart />;

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
            <td valign="middle" style={{ width: '330px' }}>
              <Form>
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Typ
                  {'  '}
                  <FontAwesomeIcon
                    icon={faBicycle}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />{' '}
                  <FontAwesomeIcon
                    icon={faChargingStation}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={'filter.ebike.laden.only'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.stationsart = ['Ladestation'];
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={
                    filterState.stationsart?.includes('Ladestation') &&
                    !filterState.stationsart?.includes('Verleihstation')
                  }
                  inline
                  label="nur Ladestationen"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={'filter.ebike.renting.only'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.stationsart = ['Verleihstation'];
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={
                    filterState.stationsart?.includes('Verleihstation') &&
                    !filterState.stationsart?.includes('Ladestation')
                  }
                  inline
                  label="nur Verleihstationen"
                />
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={'filter.ebike.all'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.stationsart = [
                        'Ladestation',
                        'Verleihstation',
                      ];
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={
                    filterState.stationsart?.includes('Ladestation') &&
                    filterState.stationsart?.includes('Verleihstation')
                  }
                  inline
                  label="alle Stationen"
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
                  Ladestation - Verfügbarkeit
                  {'  '}
                  <FontAwesomeIcon
                    icon={faToggleOn}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.emob.online.only'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.nur_online = true;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState?.nur_online}
                  inline
                  label="nur verfügbare Ladestationen (online)"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.emob.online.all'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.nur_online = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={!filterState?.nur_online}
                  inline
                  label="alle Ladestationen"
                />
                <br />
              </Form>
              <Form>
                <br />
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Ladestation - Öffnungszeiten
                  <FontAwesomeIcon
                    icon={faClock}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.ebikes.open.24/7'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.immer_offen = true;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.immer_offen}
                  inline
                  label="24/7"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={'filter.ebikes.open.*'}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.immer_offen = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={!filterState.immer_offen}
                  inline
                  label="alle Ladestationen"
                />
                <br />
              </Form>
              <Form>
                <br />
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Ladestation - Ökostrom{' '}
                  <FontAwesomeIcon
                    icon={faLeaf}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.emob.green.only'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.gruener_strom = true;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.gruener_strom}
                  inline
                  label="nur Ökostrom-Ladestationen"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.emob.green.all'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.gruener_strom = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={!filterState.gruener_strom}
                  inline
                  label="alle Ladestationen"
                />
                <br />
              </Form>
              <Form>
                <br />
                <label
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    marginBottom: '5px',
                    fontWeight: 700,
                  }}
                >
                  Ladestation - Ladebox vorhanden{' '}
                  <FontAwesomeIcon
                    icon={faToggleOn}
                    size="2x"
                    style={{
                      color: 'grey',
                      width: '30px',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.ebikes.ladebox_zu.only'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.ladebox_zu = true;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.ladebox_zu}
                  inline
                  label="nur Ladestationen mit Ladeboxen"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  disabled={!filterState.stationsart?.includes('Ladestation')}
                  key={'filter.ebikes.ladebox_zu.all'}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    if (e.target.checked) {
                      newFilterState.ladebox_zu = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={!filterState.ladebox_zu}
                  inline
                  label="alle Ladestationen"
                />
                <br />
              </Form>
              <br />
              <br />
              <p>
                <Button
                  onClick={() => {
                    setFilterState({
                      stationsart: ['Ladestation', 'Verleihstation'],
                      nur_online: false,
                      immer_offen: false,
                      gruener_strom: false,
                      ladebox_zu: false,
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
