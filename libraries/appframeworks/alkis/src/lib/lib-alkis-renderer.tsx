import { AlkisRendererProps } from "..";
import { useEffect, useState } from "react";
import { getLandparcelHtml } from "../lib/utils/landparcelSearch";
import { InfoBar } from "./components/InfoBar";
import { Divider, Skeleton, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { CustomCard } from "./components/CustomCard";
import { className } from "cesium";

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
        setIsLoading,
        isLoading
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
      <div className="flex flex-col items-center relative h-full max-h-[calc(100vh-43px)]">
        <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
          <div>
            {!isLoading ? (
              <div className="my-1">{resHtml && <div>{resHtml}</div>}</div>
            ) : (
              <div>
                <CustomCard
                  className="mb-2"
                  title={
                    <span>
                      <span>Flurstück</span>
                      <Spin
                        indicator={<LoadingOutlined spin />}
                        size="small"
                        className="ml-2"
                      />
                    </span>
                  }
                >
                  <Skeleton />
                </CustomCard>
                <CustomCard title="PDF-Produkte">
                  <Skeleton />
                </CustomCard>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
