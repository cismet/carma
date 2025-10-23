import {
  checkPdfProductPermission,
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
  productsPdfWithPermission,
} from "../utils/apiMethods";
import { getLandRegisterDistrict, pdfProductsSheet } from "../utils/helper";
import { BookingContent } from "../components/BookingContent";

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
  let preparedName = name.length < 14 ? name + " " : name;

  const booking = await getBookingOfficesBySheetId(
    preparedName,
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

  function parseLandparcelCode(code) {
    return code.split("-").map((part) => parseInt(part, 10));
  }

  function compareLandparcelCodes(codeA, codeB) {
    const [a1, a2, a3] = parseLandparcelCode(codeA);
    const [b1, b2, b3] = parseLandparcelCode(codeB);

    if (a1 - b1 !== 0) {
      return a1 - b1;
    }

    if (a2 - b2 !== 0) {
      return a2 - b2;
    }
    return a3 - b3;
  }

  const sortedBooking = [...bookingOff].sort((a, b) => {
    const lfnA = parseInt(a.alkis_buchungsblatt_landparcel.lfn, 10);
    const lfnB = parseInt(b.alkis_buchungsblatt_landparcel.lfn, 10);

    if (lfnA !== lfnB) {
      return lfnA - lfnB;
    }

    return compareLandparcelCodes(
      a.alkis_buchungsblatt_landparcel.landparcelcode,
      b.alkis_buchungsblatt_landparcel.landparcelcode
    );
  });

  const localCourt = sheetData.res.offices.districtCourtName[0];
  const leafType = sheetData.res.blattart;

  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  const sheetCode = sheetData.res.buchungsblattCode;
  const districtName = getLandRegisterDistrict(sheetCode);

  const geometry = sortedBooking.map((g, idx) => {
    return {
      type: "Feature",
      id: g.alkis_buchungsblatt_landparcel?.id,
      geometry: {
        type: g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field.type,
        coordinates:
          g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field
            ?.coordinates,
      },
      properties: {
        id: idx,
      },
      crs: g?.alkis_buchungsblatt_landparcel?.extended_geom?.geo_field.crs,
    };
  });

  return (
    <BookingContent
      bookingOff={sortedBooking}
      localCourt={localCourt}
      leafType={leafType}
      bookingType={bookingType}
      districtName={districtName}
      geometry={geometry}
      sheetCode={sheetCode}
      flurstueck={flurstueck}
      name={name}
      jwt={jwt}
      allPdfPermission={allPdfPermission}
      sheetData={sheetData}
    />
  );
};
