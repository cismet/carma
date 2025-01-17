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
    const onLandparcelSearch = async (jwt, value) => {
      setIdTitle(value);
      const landparcelHtml = await getLandparcelHtml(jwt, value);
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
        <div
          className="flex gap-4 items-center my-5"
          style={{
            display: "flex",
            gap: "4rem",
            marginTop: "60px",
            marginBottom: "10px",
          }}
        >
          <div style={{ cursor: "pointer" }}>{idTitle}</div>
          {resHtml && <div style={{ marginTop: "40px" }}>{resHtml}</div>}
        </div>
      )}
    </div>
  );
};

export default AlkisLandparcelPage;
