import React from "react";
import { useEffect, useState } from "react";
import { InfoBar } from "../components/InfoBar";
import { getSheetHtml } from "../utils/bookingSheetSearch";
import { Breadcrumb, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { AlkisBookingSheetRendererProps } from "../..";

export const AlkisBookingSheetRenderer = ({
  id,
  jwt,
  flurstueck,
}: AlkisBookingSheetRendererProps) => {
  const [resHtml, setResHtml] = useState<React.ReactNode>(null);
  const [idTitle, setIdTitle] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const onSheetSearch = async (jwt, id) => {
      if (jwt) {
        setIsLoading(true);
        const sheetHtml = await getSheetHtml(jwt, id, setError, setIsLoading);
        setResHtml(sheetHtml);
        setIdTitle(id);
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
        <InfoBar
          title={
            <div className="text-base">
              <span>
                {!error && "Buchungsblatt"}
                <span>
                  {isLoading ? (
                    <Spin
                      indicator={<LoadingOutlined spin />}
                      size="small"
                      className="ml-2"
                    />
                  ) : (
                    error && `${error}`
                  )}
                </span>
              </span>
              {!isLoading && !error && (
                <Breadcrumb
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
              )}
            </div>
          }
          className="py-1"
        />

        <div className="">
          {idTitle && !isLoading && (
            <div className="my-1">{resHtml && <div>{resHtml}</div>}</div>
          )}
        </div>
      </div>
    </div>
  );
};
