import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";
import { getLandparcelHtml } from "../helper/landparcelSearch.jsx";
import InfoBar from "../components/commons/InfoBar.jsx";
import { getSheetHtml } from "../helper/bookingSheetSearch.jsx";
import { Breadcrumb } from "antd";

const AlkisBookingSheetPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const flurstueck = searchParams.get("flurstueck");
  const jwt = useSelector(getJWT);
  const [resHtml, setResHtml] = useState(null);
  const [idTitle, setIdTitle] = useState(null);
  useEffect(() => {
    const onSheetSearch = async (jwt, id) => {
      if (jwt) {
        const sheetHtml = await getSheetHtml(jwt, id);
        setResHtml(sheetHtml);
        setIdTitle(id);
      }
    };

    if (jwt && id) {
      onSheetSearch(jwt, id);
    }
    getLandparcelHtml();
  }, [jwt, id]);

  return (
    <div>
      <div className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]">
        <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
          <InfoBar
            title={
              <div className="font-sans text-base">
                <span>
                  Buchungsblatt: <span>{idTitle}</span>
                </span>
                <Breadcrumb
                  className="text-base"
                  style={{ fontSize: "1rem !important" }}
                  items={[
                    {
                      title: ":flurstueck",
                      href: `/#/alkis-flurstueck?id=${flurstueck}`,
                    },
                    {
                      title: ":id",
                      href: "",
                    },
                  ]}
                  params={{
                    id,
                    flurstueck,
                  }}
                />
              </div>
            }
            className="py-1"
          />

          <div className="">
            {idTitle && (
              <div className="my-1">{resHtml && <div>{resHtml}</div>}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlkisBookingSheetPage;
