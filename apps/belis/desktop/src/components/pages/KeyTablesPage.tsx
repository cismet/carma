import { useRef } from "react";
import TopNavbar from "../commons/TopNavbar";

const KeyTablesPage = () => {
  let refUpperToolbar = useRef(null);

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
