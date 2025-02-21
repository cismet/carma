import { AlkisRendererProps } from "..";
import { useEffect, useState } from "react";
import { getLandparcelHtml } from "../lib/utils/landparcelSearch";
import { Divider, Skeleton, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { CustomCard } from "./components/CustomCard";
import "./alkis.css";

export function AlkisRenderer({ landparcelId, jwt }: AlkisRendererProps) {
  const [resHtml, setResHtml] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const onLandparcelSearch = async (jwt, landparcelId) => {
      const landparcelHtml = await getLandparcelHtml(
        jwt,
        landparcelId,
        setError,
        setIsLoading,
        isLoading
      );
      setResHtml(landparcelHtml);
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
            {!isLoading && !error ? (
              <div className="mt-3">{resHtml && <div>{resHtml}</div>}</div>
            ) : (
              <div className="mt-3">
                <CustomCard
                  className="mb-4"
                  title={
                    <>
                      <span>Flurstück</span>
                      {isLoading && (
                        <Spin
                          indicator={<LoadingOutlined spin />}
                          size="small"
                          className="ml-2"
                        />
                      )}
                    </>
                  }
                >
                  {error ? (
                    <span className="text-red-600">{error}</span>
                  ) : (
                    <>
                      <div className="font-bold mb-2">
                        Flurstücksinformationen
                      </div>
                      <div className="flex justify-between gap-8">
                        <div className="w-[25%]">
                          <Skeleton title={false} />
                          <Skeleton title={false} />
                        </div>
                        <div className="bg-[#f3f3f3] w-[75%] h-80"></div>
                      </div>
                      <Divider />
                      <div className="font-bold mb-2">Buchungsblätter</div>
                      <Skeleton title={false} />
                      <Skeleton title={false} />
                    </>
                  )}
                </CustomCard>

                {!error && (
                  <CustomCard title="PDF-Produkte">
                    <Skeleton />
                  </CustomCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
