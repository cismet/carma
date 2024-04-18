import { faThumbsDown, faThumbsUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Chart } from 'chart.js';
import React, { useEffect, useMemo, useState } from 'react';
import { useContext } from 'react';
import { Badge, Button, Form } from 'react-bootstrap';
import ReactChartkick, { PieChart } from 'react-chartkick';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { ResponsiveTopicMapContext } from 'react-cismap/contexts/ResponsiveTopicMapContextProvider';
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';

import { crossLinkApps } from './helper/constants';
import {
  clearFilter,
  createFilterRows,
  setAllLebenslagenToFilter,
  toggleFilter,
} from './helper/filter';
import { getColorFromLebenslagenCombination } from './helper/styler';
import MultiToggleButton from './MultiToggleButton';

import 'url-search-params-polyfill';

ReactChartkick.addAdapter(Chart);

const FilterUI = ({ apps = crossLinkApps }) => {
  const { itemsDictionary, filteredItems, filterState } = useContext(
    FeatureCollectionContext
  );
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);
  const filteredPOIs = filteredItems || [];
  const lebenslagen = useMemo(
    () => itemsDictionary?.lebenslagen || [],
    [itemsDictionary]
  );
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const [filterRows, setFilterRows] = useState();
  const { additionalStylingInfo } = useContext(TopicMapStylingContext);
  const poiColors = additionalStylingInfo?.poiColors;
  useEffect(() => {
    setFilterRows(
      createFilterRows(
        apps,
        lebenslagen,
        toggleFilter,
        filterState,
        setFilterState
      )
    );
  }, [apps, lebenslagen, setFilterState, filterState]);

  const width = windowSize?.width || 500;

  // kind means negativ or positiv
  // filter measn single lebenslage

  let widePieChartPlaceholder;
  let narrowPieChartPlaceholder;

  let stats = {};
  let colormodel = {};
  for (let poi of filteredPOIs) {
    if (stats[poi.mainlocationtype.lebenslagen.join(', ')] === undefined) {
      const ll = poi.mainlocationtype.lebenslagen;

      const key = ll
        .slice()
        .sort(function (a, b) {
          return a.localeCompare(b);
        })
        .join(', ');
      stats[key] = 1;
      colormodel[key] = getColorFromLebenslagenCombination(key, poiColors);
    } else {
      stats[poi.mainlocationtype.lebenslagen.join(', ')] =
        stats[poi.mainlocationtype.lebenslagen.join(', ')] + 1;
    }
  }

  let piechartData = [];
  let piechartColor = [];

  for (let key in stats) {
    piechartData.push([key, stats[key]]);
    piechartColor.push(getColorFromLebenslagenCombination(key, poiColors));
  }

  let pieChart = (
    <PieChart
      data={piechartData}
      donut={true}
      title="Verteilung"
      legend={false}
      colors={piechartColor}
    />
  );

  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br /> {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = pieChart;
  }

  let additionalApps;
  let additionalAppArray = [];
  let usedApps = [];

  for (const app of apps) {
    for (const appLebenslage of app.on) {
      if (
        filterState?.positiv &&
        filterState.positiv.indexOf(appLebenslage) !== -1 &&
        usedApps.indexOf(app.name) === -1
      ) {
        usedApps.push(app.name);
        additionalAppArray.push(
          <a
            key={'appLink_' + app.name}
            style={{
              textDecoration: 'none',
            }}
            href={app.link}
            target={app.target}
            rel="noopener noreferrer"
          >
            <Badge
              variant={app.bsStyle}
              style={{
                backgroundColor: app.backgroundColor,
                marginRight: '5px',
                display: 'inline-block',
                color: 'white',
              }}
            >
              {app.name}
            </Badge>
          </a>
        );
      }
    }
  }

  if (usedApps.length > 0) {
    additionalApps = (
      <div>
        <hr />
        <strong>* Themenspezifische Karten:</strong>
        {'  '}
        <h4
          style={{
            lineHeight: 1.7,
            wordWrap: 'break-word',
            wordBreak: 'normal',
            lineBreak: 'strict',
            hyphens: 'none',
            overflowWrap: 'break-word',
            WebkitHyphens: 'none',
            MozHyphens: 'none',
          }}
        >
          {additionalAppArray}
        </h4>
      </div>
    );
  }

  return (
    <div>
      <div align="center">
        <Button
          style={{
            margin: 4,
            marginLeft: 0,
          }}
          variant="light"
          onClick={() => {
            setAllLebenslagenToFilter(
              'positiv',
              lebenslagen,
              clearFilter('negativ', filterState, setFilterState),
              setFilterState
            );
          }}
        >
          alle Themen ausw&auml;hlen
        </Button>

        <Button
          variant="light"
          style={{
            margin: 4,
          }}
          onClick={() => {
            clearFilter('positiv', filterState, setFilterState);
          }}
        >
          keine Themen ausw&auml;hlen
        </Button>
        <Button
          variant="light"
          style={{
            margin: 4,
          }}
          onClick={() => {
            clearFilter('negativ', filterState, setFilterState);
          }}
        >
          keine Themen ausschlie&szlig;en
        </Button>
      </div>
      <br />
      {widePieChartPlaceholder && (
        <div
          style={{
            width: '100%',
            // background: "green",
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            justifyContent: 'normal',
            alignItems: 'normal',
            alignContent: 'normal',
          }}
        >
          <div
            style={{
              display: 'block',
              // background: "yellow",
              flexGrow: '0',
              flexShrink: '1',
              flexBasis: 'auto',
              alignSelf: 'auto',
              order: '0',
            }}
          >
            {filterRows}
          </div>
          <div
            style={{
              display: 'block',

              // background: "blue",

              flexGrow: '1',
              flexShrink: '1',
              flexBasis: 'auto',
              alignSelf: 'auto',
              order: '0',
              alignContent: 'center',
            }}
          >
            {widePieChartPlaceholder}
          </div>
        </div>
      )}
      {narrowPieChartPlaceholder && (
        <div
          style={{
            display: 'block',
            // background: "yellow",
            flexGrow: '0',
            flexShrink: '1',
            flexBasis: 'auto',
            alignSelf: 'auto',
            order: '0',
            paddingLeft: 20,
            paddingRight: 20,
          }}
        >
          {filterRows}
        </div>
      )}
      {narrowPieChartPlaceholder}
      {additionalApps}
    </div>
  );
};
export default FilterUI;
