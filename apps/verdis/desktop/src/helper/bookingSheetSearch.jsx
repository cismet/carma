import AdditionalSheet from "../components/render/AdditionalSheet";
import CustomCard from "../components/ui/Card";
import {
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
} from "./apiMethods";
import {
  bookingColors,
  getAdditionalTextForBooking,
  getBookingByLandparcelCode,
  getLandRegisterDistrict,
} from "./utility";

export const getSheetHtml = async (jwt, name, setError, setIsLoading) => {
  const sheetData = await getAdditionalSheetAsync(
    name,
    jwt,
    setError,
    setIsLoading
  );
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  if (booking.data.alkis_buchungsblatt.length === 0) {
    setError("No data found");
  }
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
      </CustomCard>
    </div>
  );
};
