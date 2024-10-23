import { useMemo } from 'react';
import { useContext } from 'react';
import Select from 'react-select';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import './accordion.css';

const FilterUI = () => {
  const { itemsDictionary, filterState } = useContext(FeatureCollectionContext);
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);
  const zielgruppen = useMemo(
    () => itemsDictionary?.zielgruppen || [],
    [itemsDictionary]
  );

  return (
    <div>
      <h4>Ich suche nach:</h4>
      <Select
        placeholder="Kategorien auswählen ..."
        styles={{
          control: (baseStyles) => ({
            ...baseStyles,
            marginBottom: 8,
          }),
          menuList: (baseStyles) => ({
            ...baseStyles,
            maxHeight: 156,
          }),
        }}
        options={[
          {
            label: 'Zielgruppe',
            options: zielgruppen.map((zielgruppe) => {
              return {
                value: zielgruppe,
                label: zielgruppe,
              };
            }),
          },
        ]}
        isMulti
        allowClear
        value={filterState.positiv.map((zielgruppe) => {
          return {
            value: zielgruppe,
            label: zielgruppe,
          };
        })}
        onChange={(value) => {
          const newFilterState = { ...filterState };
          newFilterState.positiv = value.map((zielgruppe) => {
            return zielgruppe.value;
          });
          setFilterState(newFilterState);
        }}
      />
      <h4>Ich schlie&szlig;e aus:</h4>
      <Select
        placeholder="Kategorien auswählen ..."
        styles={{
          menuList: (baseStyles) => ({
            ...baseStyles,
            maxHeight: 156,
          }),
        }}
        options={[
          {
            label: 'Zielgruppe',
            options: zielgruppen.map((zielgruppe) => {
              return {
                value: zielgruppe,
                label: zielgruppe,
              };
            }),
          },
        ]}
        isMulti
        allowClear
        value={filterState.negativ.map((zielgruppe) => {
          return {
            value: zielgruppe,
            label: zielgruppe,
          };
        })}
        onChange={(value) => {
          const newFilterState = { ...filterState };
          newFilterState.negativ = value.map((zielgruppe) => {
            return zielgruppe.value;
          });
          setFilterState(newFilterState);
        }}
      />
    </div>
  );
};
export default FilterUI;
