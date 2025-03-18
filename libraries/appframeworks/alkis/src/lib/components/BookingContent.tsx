import React, { useState } from "react";
import { AdditionalSheet } from "../components/AdditionalSheet";
import { CustomCard } from "../components/CustomCard";
import {
  additionalSheetExtractor,
  bookingColors,
  getAdditionalTextForBooking,
  getBookingByLandparcelCode,
} from "../utils/helper";
import PdfDocumentLoader from "../components/PdfDocumentLoader";
import { Map } from "../components/Map";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { Breadcrumb, Divider } from "antd";
import {
  DataItem,
  AlkisFeature,
  ConfigPdfProduct,
  BookingResData,
} from "../..";

interface BookingContentProps {
  bookingOff: DataItem[];
  localCourt: string;
  leafType: string;
  bookingType: string;
  sheetCode: string;
  districtName: string;
  geometry: AlkisFeature[];
  flurstueck: string;
  name: string;
  jwt: string;
  allPdfPermission: ConfigPdfProduct[];
  sheetData: BookingResData;
}

export const BookingContent = ({
  bookingOff,
  localCourt,
  leafType,
  bookingType,
  sheetCode,
  districtName,
  geometry,
  flurstueck,
  name,
  jwt,
  allPdfPermission,
  sheetData,
}: BookingContentProps) => {
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);

  const urlPrefix = window.location.origin + window.location.pathname;

  return (
    <TopicMapContextProvider appKey="verdis-desktop-render.map">
      <div>
        <CustomCard
          style={{ marginBottom: "1rem" }}
          title={
            <div className="flex gap-4 items-center">
              <div>Buchungsblatt</div>
              <Breadcrumb className="mr-2">
                <Breadcrumb.Item
                  href={`${urlPrefix}#/alkis-flurstueck?id=${flurstueck}`}
                  className="text-primary hover:bg-transparent"
                >
                  <span>{flurstueck}</span>{" "}
                </Breadcrumb.Item>
                <Breadcrumb.Item>
                  <span>{name}</span>
                </Breadcrumb.Item>
              </Breadcrumb>
            </div>
          }
        >
          <div>
            <div className="font-bold mb-3">Buchungsblattinformationen</div>

            <div className="flex gap-4 w-full  max-[970px]:flex-col">
              <div className="w-[30%] max-[970px]:w-full">
                <div>
                  <b>Amtsgericht:</b> {localCourt}
                </div>
                {districtName && (
                  <div>
                    <b>Grundbuchbezirk:</b> {districtName}
                  </div>
                )}
                <div>
                  <b>Blattart:</b> {leafType}
                </div>
                <div>
                  <b>Buchungsart:</b> {bookingType}
                </div>
              </div>
              <div className="w-[70%] max-[970px]:w-[100%] mb-2">
                <Map
                  extractor={additionalSheetExtractor}
                  dataIn={geometry}
                  selectedFeature={selectedFeature}
                />
              </div>
            </div>
          </div>
          <Divider />
          <div className="font-bold mb-4">Eigentümer</div>
          <AdditionalSheet
            owners={sheetData.res.owners}
            namesArr={sheetData.res.namensnummern}
            legalDesc={sheetData.res.descriptionOfRechtsgemeinschaft}
          />

          <Divider />
          <div className="font-bold mb-1">Buchungsstellen und Flurstücke</div>
          <div>
            {bookingOff.map((o, idx) => {
              const bookingArr = getBookingByLandparcelCode(
                o.alkis_buchungsblatt_landparcel.landparcelcode,
                sheetData.res.buchungsstellen
              );

              const color = bookingColors[idx % bookingColors.length];

              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() =>
                    setSelectedFeature(o.alkis_buchungsblatt_landparcel.id)
                  }
                >
                  <span
                    className="w-1 h-10"
                    style={{ background: color }}
                  ></span>
                  <span className="mr-1">
                    {o.alkis_buchungsblatt_landparcel.lfn}
                  </span>
                  <span>{o.alkis_buchungsblatt_landparcel.landparcelcode}</span>
                  <span>
                    {bookingArr.length === 1 &&
                      getAdditionalTextForBooking(bookingArr[0], bookingType)}
                  </span>
                </div>
              );
            })}
          </div>
        </CustomCard>

        <PdfDocumentLoader
          loadingCode={sheetCode}
          allPdfPermission={allPdfPermission}
          jwt={jwt}
        />
      </div>
    </TopicMapContextProvider>
  );
};
