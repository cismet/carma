import React from "react";
import { useEffect, useState } from "react";
import { getSheetHtml } from "../utils/bookingSheetSearch";
import { Divider, Skeleton, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { AlkisBookingSheetRendererProps } from "../..";
import { CustomCard } from "./CustomCard";

export const AlkisBookingSheetRenderer = ({
  id,
  jwt,
  flurstueck,
}: AlkisBookingSheetRendererProps) => {
  const [resHtml, setResHtml] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const onSheetSearch = async (jwt, id) => {
      if (jwt) {
        setIsLoading(true);
        const sheetHtml = await getSheetHtml(
          jwt,
          id,
          setError,
          setIsLoading,
          flurstueck
        );
        setResHtml(sheetHtml);
        setIsLoading(false);
      }
    };

    if (jwt && id) {
      onSheetSearch(jwt, id);
    }
  }, [jwt, id]);

  return (
    <div className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]">
      <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
        <div>
          {!isLoading && !error ? (
            <div className="mt-3">{resHtml && <div>{resHtml}</div>}</div>
          ) : (
            <CustomCard
              className="mt-3"
              title={
                <span>
                  <span>Buchungsblatt</span>
                  {isLoading && (
                    <Spin
                      indicator={<LoadingOutlined spin />}
                      size="small"
                      className="ml-2"
                    />
                  )}
                </span>
              }
            >
              {!error && (
                <>
                  <div className="font-bold mb-2">
                    Buchungsblattinformationen
                  </div>
                  <div className="flex justify-between gap-20">
                    <div className="w-[15%]">
                      <Skeleton title={false} />
                      <Skeleton title={false} />
                    </div>
                    <div className="bg-[#f3f3f3] w-[75%] h-80"></div>
                  </div>
                  <Divider />
                  <div className="font-bold mb-2">Eigentümer</div>
                  <Skeleton title={false} />
                  <Skeleton title={false} />

                  <div className="font-bold mb-2">
                    Buchungsstellen und Flurstücke
                  </div>
                  <Skeleton title={false} />
                  <Skeleton title={false} />
                </>
              )}

              {error && <span className="text-red-600">{error}</span>}
            </CustomCard>
          )}
        </div>
        {isLoading && !error && (
          <CustomCard title="PDF-Produkte" className="mt-2">
            <Skeleton />
          </CustomCard>
        )}
      </div>
    </div>
  );
};
