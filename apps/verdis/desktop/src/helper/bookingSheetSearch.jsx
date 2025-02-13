import { FilePdfOutlined, LoadingOutlined } from "@ant-design/icons";
import AdditionalSheet from "../components/render/AdditionalSheet";
import CustomCard from "../components/ui/Card";
import {
  checkPdfProductPermission,
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
  loadPdfProduct,
  productsPdfWithPermission,
} from "./apiMethods";
import {
  additionalSheetExtractor,
  bookingColors,
  getAdditionalTextForBooking,
  getBookingByLandparcelCode,
  getLandRegisterDistrict,
  pdfProductsSheet,
} from "./utility";
import { Spin } from "antd";
import PdfDocumentLoader from "../components/render/PdfDocumentLoader";
import MapRender from "../components/commons/MapRender";

export const getSheetHtml = async (jwt, name, setError, setIsLoading) => {
  const sheetData = await getAdditionalSheetAsync(
    name,
    jwt,
    setError,
    setIsLoading
  );
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  if (booking.data.alkis_buchungsblatt.length === 0) {
    setError("Keine Daten gefunden");
  }

  const isAlkisProduct = await checkPdfProductPermission(
    "csa%3A%2F%2FalkisProduct",
    jwt
  );
  const isBillingMode = await checkPdfProductPermission("billing.mode", jwt);

  const allPdfPermission = await productsPdfWithPermission(
    jwt,
    pdfProductsSheet,
    isAlkisProduct["csa://alkisProduct@WUNDA_BLAU"],
    isBillingMode["billing.mode@WUNDA_BLAU"]
  );

  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  const leafType = sheetData.res.blattart;

  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  const sheetCode = sheetData.res.buchungsblattCode;
  const districtName = getLandRegisterDistrict(sheetCode);

  const alkis_id = sheetCode;

  console.log("xxx sheetData", sheetData);
  console.log("xxx booking", booking);

  return (
    <div>
      <CustomCard title="Buchungsblatt-Renderer">
        <CustomCard style={{ marginBottom: "1rem" }} title="Buchungsblatt">
          <div className="flex gap-4 w-full  max-[970px]:flex-col">
            <div className="w-[25%]">
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
            <div className="w-[75%] max-[970px]:w-[100%] mb-2">
              <MapRender
              // extractor={additionalSheetExtractor}
              // dataIn={geometry}
              />
            </div>
          </div>
        </CustomCard>
        <CustomCard style={{ marginBottom: "1rem" }} title="Eigentümer">
          <AdditionalSheet
            owners={sheetData.res.owners}
            namesArr={sheetData.res.namensnummern}
            legalDesc={sheetData.res.descriptionOfRechtsgemeinschaft}
          />
        </CustomCard>
        <CustomCard
          title="Buchungsstellen und Flurstücke"
          style={{ marginBottom: "1rem" }}
        >
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
      </CustomCard>
    </div>
  );
};
