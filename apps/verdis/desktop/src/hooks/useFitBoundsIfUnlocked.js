import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  fitBounds,
  getLockMap,
  getLockMapOnlyInKassenzeichen,
} from '../store/slices/mapping';

export function useFitBoundsIfUnlocked() {
  const dispatch = useDispatch();
  const lockMap = useSelector(getLockMap);
  const lockMapOnlyInKassenzeichen = useSelector(getLockMapOnlyInKassenzeichen);

  useEffect(() => {
    if (!lockMap && !lockMapOnlyInKassenzeichen) {
      dispatch(fitBounds());
    }
  }, [dispatch, lockMap, lockMapOnlyInKassenzeichen]);
}
