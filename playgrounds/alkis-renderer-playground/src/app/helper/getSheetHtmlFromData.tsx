import {
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
} from "./getToken";
import AdditionalSheet from "../components/AdditionalSheet";
import CustomCard from "../components/CustomCard";

type BookingOffisesItem = {
  alkis_buchungsblatt_landparcel: {
    lfn: string;
    landparcelcode: string;
  };
};

export const getSheetHtml = async (jwt: string, name: string) => {
  const sheetData = await getAdditionalSheetAsync(name, jwt);
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  const markingName =
    sheetData?.res?.buchungsstellen?.[0]?.landParcel?.[0]
      ?.administrativeDistricts?.gemarkungName ?? null;

  const markingCode =
    sheetData?.res?.buchungsstellen?.[0]?.landParcel?.[0]
      ?.administrativeDistricts?.gemarkungCode ?? null;

  const leafType = sheetData.res.blattart;
  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  return (
    <div>
      <CustomCard title="Buchungsblatt">
        <CustomCard style={{ marginBottom: "1rem" }} title="Buchungsblatt">
          <div>
            <div>
              <b>Amtsgericht:</b> {localCourt}
            </div>
            {markingName && markingCode && (
              <div>
                <b>Grundbuchbezirk:</b> {markingName} ({markingCode})
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
            {bookingOff.map((o: BookingOffisesItem, idx: number) => {
              return (
                <div key={idx}>
                  {o.alkis_buchungsblatt_landparcel.lfn}{" "}
                  {o.alkis_buchungsblatt_landparcel.landparcelcode}
                </div>
              );
            })}
          </div>
        </CustomCard>
      </CustomCard>
    </div>
  );
};
