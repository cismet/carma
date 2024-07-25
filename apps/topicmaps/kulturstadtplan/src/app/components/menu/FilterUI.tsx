import { useContext } from 'react';
import { Form, Tabs, Tab } from 'react-bootstrap';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { ResponsiveTopicMapContext } from 'react-cismap/contexts/ResponsiveTopicMapContextProvider';

import 'url-search-params-polyfill';
import Icon from 'react-cismap/commons/Icon';
import {
  getAllEinrichtungen,
  getColorFromMainlocationTypeName,
  textConversion,
} from '../../../helper/styler';
import KulturPieChart from './KulturPieChart';

const FilterUI = () => {
  // @ts-expect-error legacy codebase exception
  const { filterState, itemsDictionary } = useContext(FeatureCollectionContext);
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);
  const { windowSize } = useContext(ResponsiveTopicMapContext);

  const width = windowSize?.width || 500;

  let widePieChartPlaceholder: any = null;
  let narrowPieChartPlaceholder: any = null;

  let pieChart = <KulturPieChart />;

  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br /> {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = pieChart;
  }

  const setFilterValue = (kind, item, value) => {
    const newFilterState = JSON.parse(JSON.stringify(filterState));

    if (value) {
      if (newFilterState[kind].indexOf(item) === -1) {
        newFilterState[kind].push(item);
      }
    } else {
      if (newFilterState[kind].indexOf(item) !== -1) {
        let filterStateSet = new Set(newFilterState[kind]);
        filterStateSet.delete(item);
        newFilterState[kind] = Array.from(filterStateSet);
      }
    }
    setFilterState(newFilterState);
  };

  const clearFilter = (kind) => {
    const newFilterState = { ...filterState };
    newFilterState[kind] = [];
    setFilterState(newFilterState);
  };

  const setAllFilter = (kind) => {
    const newFilterState = JSON.parse(JSON.stringify(filterState));
    const einrichtungen = getAllEinrichtungen().map(
      (einrichtung) => einrichtung
    );
    const veranstaltungen = itemsDictionary?.veranstaltungsarten?.map(
      (veranstaltung) => veranstaltung
    );
    if (kind === 'veranstaltung') {
      newFilterState[kind] = veranstaltungen;
    } else if (kind === 'einrichtung') {
      newFilterState[kind] = einrichtungen;
    }

    setFilterState(newFilterState);
  };

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td style={{ width: '330px', verticalAlign: 'top' }}>
              <Form>
                <table style={{ width: '100%', border: 0 }}>
                  <tbody style={{ width: '100%', verticalAlign: 'top' }}>
                    <tr>
                      <td>
                        <div style={{ width: '100%' }}>
                          <h4>Filtern nach</h4>
                          <Tabs
                            id="controlled-tabs"
                            activeKey={filterState.mode}
                            onSelect={(key) => {
                              if (key) {
                                const newFilterState = { ...filterState };
                                newFilterState.mode = key;
                                setFilterState(newFilterState);
                              }
                            }}
                          >
                            <Tab eventKey="einrichtungen" title="Einrichtungen">
                              <table style={{ width: '100%', margin: 8 }}>
                                <tbody>
                                  <tr>
                                    <td align="center">
                                      <a
                                        style={{
                                          margin: 4,
                                        }}
                                        onClick={() => {
                                          setAllFilter('einrichtung');
                                        }}
                                        className="renderAsLink"
                                      >
                                        alle
                                      </a>
                                    </td>
                                    <td align="center">
                                      <a
                                        style={{
                                          margin: 4,
                                        }}
                                        onClick={() => {
                                          clearFilter('einrichtung');
                                        }}
                                        className="renderAsLink"
                                      >
                                        keine
                                      </a>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>

                              {getAllEinrichtungen().map((einrichtung) => {
                                return (
                                  <div
                                    key={
                                      'filter.kulturstadtplan.kategorien.div.' +
                                      einrichtung
                                    }
                                  >
                                    <Form.Check
                                      readOnly={true}
                                      key={
                                        'filter.kulturstadtplan.kategorie.' +
                                        einrichtung
                                      }
                                      onClick={(e) => {
                                        setFilterValue(
                                          'einrichtung',
                                          einrichtung,
                                          // @ts-expect-error legacy codebase exception
                                          e.target.checked
                                        );
                                      }}
                                      checked={
                                        filterState['einrichtung']?.indexOf(
                                          einrichtung
                                        ) !== -1
                                      }
                                      inline
                                      label={
                                        <>
                                          {textConversion(einrichtung)}{' '}
                                          <Icon
                                            style={{
                                              color:
                                                getColorFromMainlocationTypeName(
                                                  einrichtung
                                                ),
                                              width: '30px',
                                              textAlign: 'center',
                                            }}
                                            name={'circle'}
                                          />
                                        </>
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </Tab>
                            <Tab
                              eventKey="veranstaltungen"
                              title="Veranstaltungen"
                            >
                              <table style={{ width: '100%', margin: 8 }}>
                                <tbody>
                                  <tr>
                                    <td align="center">
                                      <a
                                        style={{
                                          margin: 4,
                                        }}
                                        onClick={() => {
                                          setAllFilter('veranstaltung');
                                        }}
                                        className="renderAsLink"
                                      >
                                        alle
                                      </a>
                                    </td>
                                    <td align="center">
                                      <a
                                        style={{
                                          margin: 4,
                                        }}
                                        onClick={() => {
                                          clearFilter('veranstaltung');
                                        }}
                                        className="renderAsLink"
                                      >
                                        keine
                                      </a>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              {itemsDictionary?.veranstaltungsarten?.map(
                                (art) => {
                                  return (
                                    <div
                                      key={
                                        'div.filter.kulturstadtplan.veranstaltungsart.' +
                                        art
                                      }
                                    >
                                      <Form.Check
                                        readOnly={true}
                                        key={
                                          'filter.kulturstadtplan.veranstaltungsart.' +
                                          art
                                        }
                                        onClick={(e) => {
                                          setFilterValue(
                                            'veranstaltung',
                                            art,
                                            // @ts-expect-error legacy codebase exception
                                            e.target.checked
                                          );
                                        }}
                                        checked={
                                          filterState['veranstaltung']?.indexOf(
                                            art
                                          ) !== -1
                                        }
                                        inline
                                        label={<>{textConversion(art)}</>}
                                      />
                                    </div>
                                  );
                                }
                              )}
                            </Tab>
                          </Tabs>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Form>
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
