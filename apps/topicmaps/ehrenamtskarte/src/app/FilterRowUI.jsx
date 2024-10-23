import { useContext, useEffect, useState } from 'react';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { createFilterRows } from './helper/filter';

const FilterRowUI = ({ items }) => {
  const [filterRows, setFilterRows] = useState();

  const { filterState } = useContext(FeatureCollectionContext);
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);

  useEffect(() => {
    setFilterRows(createFilterRows(items, filterState, setFilterState));
  }, [items, setFilterState, filterState]);

  return <div>{filterRows}</div>;
};

export default FilterRowUI;
