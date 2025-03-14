import React from "react";
import { buildGroupedOwnersArr } from "../utils/helper";
import { AdditionalSheetProps, Name, Owner } from "../..";

export const AdditionalSheet = ({
  owners,
  namesArr,
  legalDesc,
}: AdditionalSheetProps) => {
  const ownerRes = buildGroupedOwnersArr(namesArr, owners);
  const legalCommunityInfo = namesArr.filter(
    (l) => l.beschriebRechtsgemeinschaft
  );
  return (
    <div>
      {ownerRes && (
        <div>
          {owners.map((owner, idx) => {
            const {
              salutation,
              firstName,
              foreName,
              surName,
              dateOfBirth,
              nameOfBirth,
              nameNumber,
            } = owner;
            const date = new Date(dateOfBirth);
            const day = String(date.getDate()).padStart(2, "0");
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const year = date.getFullYear();
            const formattedDate = `${day}.${month}.${year}`;

            const { houseNumber, postalCode, city, street } =
              owner.addresses?.[0] || {};

            console.log("xxx owner", owner);

            return (
              <div
                key={idx}
                style={{
                  // display: "flex",
                  gap: "3rem",
                  paddingBottom: "1.4rem",
                  // borderLeft:
                  //   owners.length > 1 ? "1px solid #d9d9d9" : "0px",
                  // paddingLeft: "10px",
                  display: "grid",
                  gridTemplateColumns: "max-content max-content",
                  rowGap: "4px",
                  columnGap: "2rem",
                  gridAutoRows: "min-content",
                }}
              >
                <div>{nameNumber}</div>
                <div>
                  {owner.addresses ? (
                    <>
                      <div style={{ paddingBottom: "0.6rem" }}>
                        {salutation} {firstName || ""} {foreName || ""}{" "}
                        {surName}
                        {", "}
                        {salutation !== "Firma" ? "*" + formattedDate : ""}
                      </div>
                      {/* {nameOfBirth && <div>geb. {nameOfBirth}</div>} */}
                      <div>
                        {street} {houseNumber}
                      </div>
                      <div>
                        <span>{postalCode}</span> <span>{city}</span>
                      </div>
                      <div>(Grundbuchamtliche Anschrift)</div>
                    </>
                  ) : (
                    <div>{surName}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {legalDesc &&
        legalCommunityInfo.map((l, idx) => {
          const ifLegalDesc = !l.nenner && !l.zaehler;
          const ifWithoutNumber = l.artRechtsgemeinschaft;
          return (
            <div className="flex gap-2 w-full">
              {ifWithoutNumber && <div>ohne Nr.</div>}

              <div
                style={{
                  paddingBottom: "1.4rem",
                  ...(!ifLegalDesc && {
                    display: "flex",
                    justifyContent: "space-between",
                  }),
                }}
              >
                <div>
                  <b>
                    {/* {!ifLegalDesc ? "Rechtsgemeinschaft:" : "Erbengemeinschaft:"} */}
                    Rechtsgemeinschaft:
                  </b>
                  {l.beschriebRechtsgemeinschaft}
                </div>
                <span>{!ifLegalDesc && " 1/2"}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
};
