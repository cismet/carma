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

  const sortedOwners = owners?.sort((a, b) => {
    const [aMajor, aMinor] = a.nameNumber.split(".");
    const [bMajor, bMinor] = b.nameNumber.split(".");

    const aMajorNum = parseInt(aMajor, 10);
    const aMinorNum = parseInt(aMinor, 10);
    const bMajorNum = parseInt(bMajor, 10);
    const bMinorNum = parseInt(bMinor, 10);

    if (aMajorNum !== bMajorNum) {
      return aMajorNum - bMajorNum;
    }
    return aMinorNum - bMinorNum;
  });
  return (
    <div>
      {ownerRes && (
        <div>
          {sortedOwners.map((owner, idx) => {
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
            let attributesZaehlerNenner: null | string = null;

            const ownerInNamesArr = namesArr.filter(
              (n) => n.eigentuemerUUId === owner.ownerId
            );

            if (ownerInNamesArr && ownerInNamesArr.length > 0) {
              const ifAttributes =
                ownerInNamesArr[0].zaehler != null &&
                ownerInNamesArr[0].nenner != null;

              if (ifAttributes) {
                attributesZaehlerNenner =
                  "zu " +
                  ownerInNamesArr[0].zaehler +
                  "/" +
                  ownerInNamesArr[0].nenner;
              }
            }

            const { houseNumber, postalCode, city, street } =
              owner.addresses?.[0] || {};

            return (
              <div
                key={idx}
                style={{
                  gap: "3rem",
                  paddingBottom: "2rem",
                  display: "grid",
                  gridTemplateColumns: attributesZaehlerNenner
                    ? "max-content max-content 1fr"
                    : "max-content max-content",
                  // rowGap: "4px",
                  columnGap: "2rem",
                  maxWidth: "500px",
                  width: "100%",
                  gridAutoRows: "min-content",
                }}
              >
                <div className="w-[40px]">{nameNumber}</div>
                <div>
                  {owner.addresses ? (
                    <>
                      <div style={{ paddingBottom: "0.6rem" }}>
                        {salutation} {firstName || ""} {foreName || ""}{" "}
                        {surName}
                        {", "}
                        {salutation !== "Firma" ? "*" + formattedDate : ""}
                        {nameOfBirth && <div>geb. {nameOfBirth}</div>}
                      </div>
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
                {attributesZaehlerNenner && (
                  <div className="text-right">{attributesZaehlerNenner}</div>
                )}
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
              {ifWithoutNumber && <div className="min-w-[60px]">ohne Nr.</div>}

              <div
                style={{
                  paddingBottom: "1.4rem",
                  ...(!ifLegalDesc && {
                    display: "flex",
                    width: "100%",
                    textAlign: "left",
                    gap: "1rem",
                    maxWidth: "800px",
                  }),
                }}
              >
                <div>
                  <b>
                    {l.artRechtsgemeinschaft === "Sonstiges"
                      ? "Rechtsgemeinschaft:"
                      : l.artRechtsgemeinschaft}
                    {/* Rechtsgemeinschaft:{" "} */}
                  </b>
                  {l.beschriebRechtsgemeinschaft}
                </div>
                <span className="ml-auto min-w-[60px]">
                  {" "}
                  {!ifLegalDesc && "zu 1/2"}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
};
