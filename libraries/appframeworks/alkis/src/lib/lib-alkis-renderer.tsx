import { AlkisRendererProps } from "..";
import { useEffect, useState } from "react";
import { getLandparcelHtml } from "../lib/utils/landparcelSearch";
import { InfoBar } from "./components/InfoBar";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

export function AlkisRenderer({ landparcelId, jwt }: AlkisRendererProps) {
  const [resHtml, setResHtml] = useState<React.ReactNode>(null);
  const [idTitle, setIdTitle] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const onLandparcelSearch = async (jwt, landparcelId) => {
      // setIsLoading(true);
      setIdTitle(landparcelId);
      const landparcelHtml = await getLandparcelHtml(
        jwt,
        landparcelId,
        setError,
        setIsLoading
      );
      setResHtml(landparcelHtml);
      // setIsLoading(false);
    };
    if (jwt && landparcelId) {
      onLandparcelSearch(jwt, landparcelId);
    }
  }, [jwt, landparcelId]);

  return (
    <div>
      <div className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]">
        <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
          <InfoBar
            title={
              <span>
                {!error && "Flurstück: "}
                <span className="text-base">
                  {isLoading ? (
                    <Spin
                      indicator={<LoadingOutlined spin />}
                      size="small"
                      className="ml-2"
                    />
                  ) : error ? (
                    `${error}`
                  ) : (
                    idTitle
                  )}
                </span>
              </span>
            }
            className="py-1"
          />

          <div className="">
            {idTitle && !error && (
              <div className="my-1">{resHtml && <div>{resHtml}</div>}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
