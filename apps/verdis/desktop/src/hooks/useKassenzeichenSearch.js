import { useQuery } from '@tanstack/react-query';
import { ENDPOINT, query } from '../constants/verdis';
import { useDispatch, useSelector } from 'react-redux';
import { getJWT } from '../store/slices/auth';
import request from 'graphql-request';
import { useSearchParams } from 'react-router-dom';
import { getSyncKassenzeichen } from '../store/slices/ui';
import {
  addSearch,
  resetStates,
  storeAenderungsAnfrage,
  storeKassenzeichen,
} from '../store/slices/search';
import {
  setBefreiungErlaubnisCollection,
  setFlaechenCollection,
  setFrontenCollection,
  setGeneralGeometryCollection,
} from '../store/slices/mapping';
import {
  getFlaechenFeatureCollection,
  getFrontenFeatureCollection,
  getGeneralGeomfeatureCollection,
  getVersickerungsGenFeatureCollection,
} from '../tools/featureFactories';

export const useKassenzeichenSearch = (kassenzeichen) => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const syncKassenzeichen = useSelector(getSyncKassenzeichen);
  const [urlParams, setUrlParams] = useSearchParams();

  return useQuery({
    onSuccess: (data) => {
      if (data?.kassenzeichen?.length > 0) {
        console.log(kassenzeichen);
        const trimmedQuery = kassenzeichen.trim();
        dispatch(storeKassenzeichen(data.kassenzeichen[0]));
        dispatch(storeAenderungsAnfrage(data.aenderungsanfrage));
        if (urlParams.get('kassenzeichen') !== trimmedQuery) {
          setUrlParams({ kassenzeichen: trimmedQuery });
        }
        dispatch(addSearch(trimmedQuery));
        dispatch(resetStates());

        if (syncKassenzeichen) {
          fetch(
            'http://localhost:18000/gotoKassenzeichen?kassenzeichen=' +
              trimmedQuery
          ).catch((error) => {
            //  i expect an error here
          });
        }

        //create the featureCollections

        dispatch(
          setFlaechenCollection(
            getFlaechenFeatureCollection(data.kassenzeichen[0])
          )
        );
        dispatch(
          setFrontenCollection(
            getFrontenFeatureCollection(data.kassenzeichen[0])
          )
        );

        dispatch(
          setGeneralGeometryCollection(
            getGeneralGeomfeatureCollection(data.kassenzeichen[0])
          )
        );

        dispatch(
          setBefreiungErlaubnisCollection(
            getVersickerungsGenFeatureCollection(data.kassenzeichen[0])
          )
        );
      }
    },
    queryKey: ['kassenzeichen', kassenzeichen],
    queryFn: async () =>
      request(
        ENDPOINT,
        query,
        { kassenzeichen: kassenzeichen },
        {
          Authorization: `Bearer ${jwt}`,
        }
      ),
    enabled: !!kassenzeichen && !isNaN(+kassenzeichen),
    refetchOnWindowFocus: false,
    retry: false,
  });
};
