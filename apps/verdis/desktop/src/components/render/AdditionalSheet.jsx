import { buildGroupedOwnersArr } from "../../helper/utility";

const AdditionalSheet = ({ owners, namesArr, legalDesc }) => {
  const typeOfTitle = namesArr[0];
  const ifLegalDesc = !typeOfTitle.nenner && !typeOfTitle.zaehler;
  const ifWithoutNumber = !typeOfTitle.artRechtsgemeinschaft;
  const ownerRes = buildGroupedOwnersArr(namesArr, owners);

  return (
    <div>
      {ownerRes.map((ownerItem, idx) => {
        return (
          <div
            style={{
              display: "flex",
              gap: "2rem",
              marginBottom: idx !== ownerRes.length - 1 ? "1.3rem" : "0px",
            }}
          >
            {!ifWithoutNumber && <div>ohne Nr.</div>}
            <div style={{ width: "70%" }}>
              {legalDesc && (
                <div
                  style={{
                    paddingBottom: "1.4rem",
                    ...(!ifLegalDesc && {
                      display: "flex",
                      justifyContent: "space-between",
                    }),
                  }}
                >
                  <b>
                    {ifLegalDesc ? "Rechtsgemeinschaft:" : "Erbengemeinschaft:"}
                  </b>{" "}
                  <span>{ifLegalDesc ? legalDesc : "zu 1/2"}</span>
                </div>
              )}
              {ownerItem.map((owner, idx) => {
                const {
                  salutation,
                  firstName,
                  surName,
                  dateOfBirth,
                  nameNumber,
                } = owner;
                const date = new Date(dateOfBirth);
                const day = String(date.getDate()).padStart(2, "0");
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const year = date.getFullYear();
                const formattedDate = `${day}.${month}.${year}`;

                const { houseNumber, postalCode, city, street } =
                  owner.addresses[0];
                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      gap: "3rem",
                      paddingBottom: "1.4rem",
                      borderLeft:
                        owners.length > 1 ? "1px solid #d9d9d9" : "0px",
                      paddingLeft: "10px",
                    }}
                  >
                    <div>{nameNumber}</div>
                    <div>
                      <div style={{ paddingBottom: "0.6rem" }}>
                        {salutation} {firstName || ""} {surName},{" "}
                        {salutation !== "Firma" ? "*" + formattedDate : ""}
                      </div>
                      <div>
                        {street} {houseNumber}
                      </div>
                      <div>
                        {postalCode}, {city}
                      </div>
                      <div>(Grundbuchamtliche Anschrift)</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdditionalSheet;
