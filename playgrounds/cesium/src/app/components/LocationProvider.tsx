import { ReactNode, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { setLocation } from '../store';

/*
 * This component is used to set the location in the store based on the hash in the URL.
 * This is used to keep track of the current location in the store.
 * TODO not yet used for any functional stuff.
 */

export function LocationProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    dispatch(setLocation(location.hash));
  }, [dispatch, location]);

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}

export default LocationProvider;
