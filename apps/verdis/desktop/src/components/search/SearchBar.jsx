import {
  ClockCircleOutlined,
  LoadingOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { AutoComplete, Input } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import {
  getErrorMessage,
  getIsLoading,
  getKassenzeichen,
  getPreviousSearches,
  getflurstuecke,
  searchForKassenzeichen,
} from '../../store/slices/search';
import { useState } from 'react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isEqual } from 'lodash';

const SearchBar = () => {
  const dispatch = useDispatch();
  const [inputValue, setInpuValue] = useState('');

  const [urlParams, setUrlParams] = useSearchParams();
  const prevSearches = useSelector(getPreviousSearches);
  const isLoading = useSelector(getIsLoading);
  const kassenzeichen = useSelector(getKassenzeichen);
  const errorMessage = useSelector(getErrorMessage);
  const kassenzeichenNummer = kassenzeichen?.kassenzeichennummer8;
  const urlKassenzeichen = urlParams.get('kassenzeichen');
  useEffect(() => {
    // if (isLoading) {
    //   return;
    // }
    if (
      urlKassenzeichen &&
      !isEqual(urlKassenzeichen, kassenzeichenNummer?.toString())
    ) {
      dispatch(searchForKassenzeichen(urlKassenzeichen));
      setInpuValue(urlKassenzeichen);
    }
  }, [urlKassenzeichen]);

  useEffect(() => {
    dispatch(getflurstuecke());
  }, []);

  return (
    <div className="flex relative items-center gap-3 w-full">
      <AutoComplete
        options={prevSearches
          .map((kassenzeichen) =>
            !isEqual(kassenzeichen, kassenzeichenNummer?.toString())
              ? {
                  value: kassenzeichen,
                  label: (
                    <div className="flex gap-2 items-center">
                      <ClockCircleOutlined className="text-lg" />
                      <span className="w-full">{kassenzeichen}</span>
                    </div>
                  ),
                }
              : null
          )
          .filter((item) => item !== null)}
        className="xl:w-1/2 w-full mx-auto"
        value={inputValue}
        onSelect={(value) =>
          dispatch(searchForKassenzeichen(value, urlParams, setUrlParams))
        }
        onChange={(value) => setInpuValue(value)}
      >
        <Input
          placeholder="Suche..."
          addonAfter={
            isLoading ? (
              <LoadingOutlined />
            ) : (
              <SearchOutlined
                onClick={() =>
                  dispatch(
                    searchForKassenzeichen(inputValue, urlParams, setUrlParams)
                  )
                }
              />
            )
          }
          onPressEnter={(e) =>
            dispatch(
              searchForKassenzeichen(inputValue, urlParams, setUrlParams)
            )
          }
          status={errorMessage && 'error'}
          name="kassenzeichen"
        />
      </AutoComplete>
    </div>
  );
};

export default SearchBar;
