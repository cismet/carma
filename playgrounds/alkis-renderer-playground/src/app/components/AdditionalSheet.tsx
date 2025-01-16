import { it } from "node:test";

export type Props = {
  owners: Owners[];
  namesArr: NamesArr[];
  legalDesc: string | null;
};

type Owners = {
  salutation: string;
  firstName: string | null;
  surName: string;
  dateOfBirth: string;
  nameNumber: string;
  addresses: any[];
  ownerId: string;
};

type NamesArr = {
  nenner: string | null;
  zaehler: string | null;
  artRechtsgemeinschaft: string | null;
  uuid: string;
  namensnummernUUIds: string[] | null;
  eigentuemerUUId: string | null;
};

const AdditionalSheet = ({ owners, namesArr, legalDesc }: Props) => {
  const typeOfTitle = namesArr[0];
  const ifLegalDesc = !typeOfTitle.nenner && !typeOfTitle.zaehler;
  const ifWithoutNumber = !typeOfTitle.artRechtsgemeinschaft;
  console.log("xxx namesArr", namesArr);
  const uuidList = namesArr.map((n) => n.uuid);

  const uuidGroupsArr = namesArr
    .filter((n) => n.namensnummernUUIds)
    .map((n) => n.namensnummernUUIds)
    .flat();

  console.log("xxx uuidGroupsArr", uuidGroupsArr);

  const removedDoubles = uuidList.filter(
    (uuid) => !uuidGroupsArr.includes(uuid)
  );

  console.log("xxx removedDoubles", removedDoubles);

  const existingsUids = namesArr
    .filter((n) => removedDoubles.includes(n.uuid))
    .map((item) => {
      if (item.namensnummernUUIds) {
        return item.namensnummernUUIds;
      } else {
        return [item.uuid];
      }
    });

  let result: string[][] = [];

  existingsUids.forEach((innerArray) => {
    let res: string[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = namesArr.filter((obj) => obj.uuid === uuid);
      if (matchingObject) {
        const withOwnerId = matchingObject.map((n) => {
          if (n.eigentuemerUUId) {
            return n.eigentuemerUUId;
          } else {
            return "";
          }
        });
        res.push(withOwnerId[0]);
      }
    });

    result.push(res);
  });

  const ownerRes: Owners[][] = [];

  result.forEach((innerArray) => {
    let res: Owners[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = owners.filter((obj) => obj.ownerId === uuid);
      if (matchingObject) {
        res.push(matchingObject[0]);
      }
    });

    ownerRes.push(res);
  });

  console.log("xxx ownerRes", ownerRes);

  // eigentuemerUUId = ownerId

  return (
    <div style={{ display: "flex", gap: "2rem" }}>
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
            <b>{ifLegalDesc ? "Rechtsgemeinschaft:" : "Erbengemeinschaft:"}</b>{" "}
            <span>{ifLegalDesc ? legalDesc : "zu 1/2"}</span>
          </div>
        )}
        {owners.map((owner, idx: number) => {
          const { salutation, firstName, surName, dateOfBirth, nameNumber } =
            owner;
          const date = new Date(dateOfBirth);
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          const formattedDate = `${day}.${month}.${year}`;

          const { houseNumber, postalCode, city, street } = owner.addresses[0];
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: "3rem",
                paddingBottom: "1.4rem",
                borderLeft: owners.length > 1 ? "1px solid #d9d9d9" : "0px",
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
};

export default AdditionalSheet;
