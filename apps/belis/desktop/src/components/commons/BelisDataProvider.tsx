import { useEffect } from "react";
import type { ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import type { AppDispatch } from "../../store";
import {
  getKeyTablesFetched,
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
} from "../../store/slices/keyTables";
import { fetchAllKeyTables } from "../../helper/apiMethods";

interface BelisDataProviderProps {
  jwt: string | undefined;
  children: ReactNode;
}

const BelisDataProvider = ({ jwt, children }: BelisDataProviderProps) => {
  const dispatch: AppDispatch = useDispatch();
  const keyTablesFetched = useSelector(getKeyTablesFetched);

  useEffect(() => {
    if (keyTablesFetched || !jwt) return;

    const fetchData = async () => {
      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(jwt);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
        if (Object.keys(errors).length > 0) {
          message.error(
            "Einige Schlüsseltabellen konnten nicht geladen werden"
          );
        }
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, [jwt, keyTablesFetched, dispatch]);

  return <>{children}</>;
};

export default BelisDataProvider;
