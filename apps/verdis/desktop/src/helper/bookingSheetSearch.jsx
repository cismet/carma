import AdditionalSheet from "../components/render/AdditionalSheet";
import CustomCard from "../components/ui/Card";
import {
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
} from "./apiMethods";
import {
  getAdditionalTextForBooking,
  getBookingByLandparcelCode,
  getLandRegisterDistrict,
} from "./utility";

export const getSheetHtml = async (jwt, name) => {
  const sheetData = await getAdditionalSheetAsync(name, jwt);
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  const leafType = sheetData.res.blattart;

  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  const sheetCode = sheetData.res.buchungsblattCode;
  const districtName = getLandRegisterDistrict(sheetCode);

  return (
    <div>
      <CustomCard title="Buchungsblatt-Renderer">
        <CustomCard style={{ marginBottom: "1rem" }} title="Buchungsblatt">
          <div>
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
        </CustomCard>
        <CustomCard style={{ marginBottom: "1rem" }} title="Eigentümer">
          <AdditionalSheet
            owners={sheetData.res.owners}
            namesArr={sheetData.res.namensnummern}
            legalDesc={sheetData.res.descriptionOfRechtsgemeinschaft}
          />
        </CustomCard>
        <CustomCard title="Buchungsstellen und Flurstücke">
          <div>
            {bookingOff.map((o, idx) => {
              const bookingArr = getBookingByLandparcelCode(
                o.alkis_buchungsblatt_landparcel.landparcelcode,
                sheetData.res.buchungsstellen
              );

              return (
                <div key={idx}>
                  {o.alkis_buchungsblatt_landparcel.lfn}{" "}
                  {o.alkis_buchungsblatt_landparcel.landparcelcode}
                  {bookingArr.length === 1 &&
                    getAdditionalTextForBooking(bookingArr[0], bookingType)}
                </div>
              );
            })}
          </div>
        </CustomCard>
      </CustomCard>
    </div>
  );
};
