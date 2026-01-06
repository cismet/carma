import { useEffect, useRef } from "react";
import TopNavbar from "../commons/TopNavbar";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import {
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
  getKeyTablesData,
  getKeyTablesErrors,
  getKeyTablesLoading,
} from "../../store/slices/keyTables";

const KeyTablesPage = () => {
  const refUpperToolbar = useRef(null);
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const data = useSelector(getKeyTablesData);
  const errors = useSelector(getKeyTablesErrors);
  const loading = useSelector(getKeyTablesLoading);

  useEffect(() => {
    const fetchData = async () => {
      dispatch(setKeyTablesLoading(true));
      const { data, errors } = await fetchAllKeyTables(storedJWT);
      dispatch(setKeyTablesData(data));
      dispatch(setKeyTablesErrors(errors));
      dispatch(setKeyTablesLoading(false));
      console.log("data", data);
      console.log("errors", errors);
    };
    fetchData();
  }, [storedJWT, dispatch]);

  return (
    <>
      <TopNavbar innerRef={refUpperToolbar} />
      <div className="mx-3 mt-1">
        <h1 className="text-2xl font-bold">Key table</h1>
      </div>
    </>
  );
};

export default KeyTablesPage;
