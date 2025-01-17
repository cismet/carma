import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";
import { getLandparcelHtml } from "../helper/landparcelSearch.jsx";
import InfoBar from "../components/commons/InfoBar.jsx";

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
      <div className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]">
        <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
          <InfoBar
            title={
              <span>
                Flurstück: <span className="text-base">{idTitle}</span>
              </span>
            }
            className="py-1"
          />

          <div className="">
            {idTitle && (
              <div className="my-2">
                {/* <div style={{ cursor: "pointer" }}>{idTitle}</div> */}
                {resHtml && <div>{resHtml}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlkisLandparcelPage;
