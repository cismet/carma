import {
  getAdditionalSheetAsync,
  getBookingOfficesBySheetId,
} from "./getToken";
import AdditionalSheet from "../components/AdditionalSheet";
import CustomCard from "../components/CustomCard";
import { getLandRegisterDistrict } from "./landparcel";

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
            {bookingOff.map((o: BookingOffisesItem, idx: number) => {
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
