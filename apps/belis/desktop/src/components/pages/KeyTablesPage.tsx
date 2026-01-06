import { useEffect, useRef } from "react";
import TopNavbar from "../commons/TopNavbar";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";

const KeyTablesPage = () => {
  let refUpperToolbar = useRef(null);
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);

  useEffect(() => {
    const fetchData = async () => {
      const { data, errors } = await fetchAllKeyTables(storedJWT);
      console.log("data", data);
      console.log("errors", errors);
    };
    fetchData();
  }, [storedJWT]);

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
