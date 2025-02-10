import AdditionalSheet from "../components/render/AdditionalSheet";
import CustomCard from "../components/ui/Card";
import {
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
} from "./apiMethods";
import { getLandRegisterDistrict } from "./utility";

export const getSheetHtml = async (jwt, name) => {
  const sheetData = await getAdditionalSheetAsync(name, jwt);
  const booking = await getBookingOfficesBySheetId(name + " ", jwt);
  const bookingOff = booking.data.alkis_buchungsblatt[0].landparcelsArray;
  const localCourt = sheetData.res.offices.districtCourtName[0];
  console.log("xxx booking", booking);
  const leafType = sheetData.res.blattart;

  const bookingType = sheetData.res.buchungsstellen[0].buchungsart;

  const sheetCode = sheetData.res.buchungsblattCode;
  const districtName = getLandRegisterDistrict(sheetCode);

  // const newInfos = sheetData.res.buchungsstellen;
  // const lfn = newInfos[0].sequentialNumber;
  // const number = newInfos[0].number;
  // const fratcion = newInfos[0].fraction;
  // const bookingTypeLandparcel = sheetData.res.buchungsstellen[0].buchungsart;
  // const landParcelCode =
  //   newInfos[0]?.buchungsstellen[0]?.landParcel[0]?.landParcelCode;

  // let newText = "";

  // if (
  //   bookingTypeLandparcel &&
  //   (bookingTypeLandparcel !== bookingType || fratcion || number)
  // ) {
  //   newText += ` (`;

  //   if (bookingTypeLandparcel && bookingTypeLandparcel !== bookingType) {
  //     newText += `${bookingTypeLandparcel}, `;
  //   }

  //   if (fratcion) {
  //     newText += "Anteil " + fratcion;
  //   }

  //   if (number) {
  //     newText += ", ATP Nr. " + number;
  //   }

  //   newText += `)`;
  // }

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
              return (
                <div key={idx}>
                  {o.alkis_buchungsblatt_landparcel.lfn}{" "}
                  {o.alkis_buchungsblatt_landparcel.landparcelcode}
                  {/* {newText} */}
                </div>
              );
            })}
          </div>
        </CustomCard>
      </CustomCard>
    </div>
  );
};
