import React from "react";
import { AdditionalSheet } from "../components/AdditionalSheet";
import { CustomCard } from "../components/CustomCard";
import {
  checkPdfProductPermission,
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
  productsPdfWithPermission,
} from "../utils/apiMethods";
import {
  additionalSheetExtractor,
  bookingColors,
  getAdditionalTextForBooking,
  getBookingByLandparcelCode,
  getLandRegisterDistrict,
  pdfProductsSheet,
} from "../utils/helper";
import PdfDocumentLoader from "../components/PdfDocumentLoader";
import { Map } from "../components/Map";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { Breadcrumb, Divider } from "antd";

export const getSheetHtml = async (
  jwt,
  name,
  setError,
  setIsLoading,
  flurstueck
) => {
  const sheetData = await getAdditionalSheetAsync(
    name,
    jwt,
    setError,
    setIsLoading
  );
  const booking = await getBookingOfficesBySheetId(
    name + " ",
    jwt,
    setError,
    setIsLoading
  );
  if (booking.data.alkis_buchungsblatt.length === 0) {
    setError("Fehler: keine Daten gefunden");
  }

  const isAlkisProduct = await checkPdfProductPermission(
    "csa%3A%2F%2FalkisProduct",
    jwt,
    setError,
    setIsLoading
  );
  const isBillingMode = await checkPdfProductPermission(
    "billing.mode",
    jwt,
    setError,
    setIsLoading
  );

  const allPdfPermission = await productsPdfWithPermission(
    jwt,
    pdfProductsSheet,
    isAlkisProduct["csa://alkisProduct@WUNDA_BLAU"],
    isBillingMode["billing.mode@WUNDA_BLAU"],
    setError,
    setIsLoading
  );

  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  const leafType = sheetData.res.blattart;

  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  const sheetCode = sheetData.res.buchungsblattCode;
  const districtName = getLandRegisterDistrict(sheetCode);

  const geometry = booking.data.alkis_buchungsblatt[0].landparcelsArray.map(
    (g, idx) => {
      return {
        type: "Feature",
        id: g.alkis_buchungsblatt_landparcel?.id,
        geometry: {
          type: g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field
            .type,
          coordinates:
            g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field
              ?.coordinates,
        },
        properties: {
          id: idx,
        },
        crs: g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field.crs,
      };
    }
  );

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
                  href={`/#/alkis-flurstueck?id=${flurstueck}`}
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
              <div className="w-[30%] min-w-">
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
                <Map extractor={additionalSheetExtractor} dataIn={geometry} />
              </div>
            </div>
          </div>
          {sheetData.res.owners[0].addresses && (
            <>
              <Divider />
              <div className="font-bold mb-1">Eigentümer</div>
              <AdditionalSheet
                owners={sheetData.res.owners}
                namesArr={sheetData.res.namensnummern}
                legalDesc={sheetData.res.descriptionOfRechtsgemeinschaft}
              />
            </>
          )}

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
