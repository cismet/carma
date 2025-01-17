import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";
import { getLandparcelHtml } from "../helper/landparcelSearch.jsx";

const AlkisLandparcelPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const jwt = useSelector(getJWT);
  const [resHtml, setResHtml] = useState(null);
  const [idTitle, setIdTitle] = useState(null);
  useEffect(() => {
    const onLandparcelSearch = async (jwt, id) => {
      setIdTitle(id);
      const landparcelHtml = await getLandparcelHtml(jwt, id);
      setResHtml(landparcelHtml);
    };
    if (jwt && id) {
      onLandparcelSearch(jwt, id);
    }
    getLandparcelHtml();
  }, [jwt, id]);

  return (
    <div>
      {idTitle && (
        <div className="my-5">
          <div style={{ cursor: "pointer" }}>{idTitle}</div>
          {resHtml && <div style={{ marginTop: "40px" }}>{resHtml}</div>}
        </div>
      )}
    </div>
  );
};

export default AlkisLandparcelPage;
