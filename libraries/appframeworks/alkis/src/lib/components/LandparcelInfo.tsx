import React from "react";
import { CustomCard } from "./CustomCard";
import { landparcelExtractor } from "../utils/helper";
import { Divider, Tabs } from "antd";
import { Link } from "react-router-dom";
import { AdditionalSheet } from "./AdditionalSheet";
import { Map } from "./Map";
import { LandparcelInfoProps, Name, Owner } from "../..";

export const LandparcelInfo = ({
  title,
  name,
  gemarkung,
  addresses,
  size,
  extendedGeom,
  sheetsCode,
  alkisId,
  isLoading,
}: LandparcelInfoProps) => {
  const urlPrefix = window.location.origin + window.location.pathname;

  function parseSheetCode(code) {
    return code.split("-").map((part) => parseInt(part, 10));
  }

  function compareSheetCodeCodes(codeA, codeB) {
    const [a1, a2] = parseSheetCode(codeA);
    const [b1, b2] = parseSheetCode(codeB);

    if (a1 - b1 !== 0) {
      return a1 - b1;
    }

    return a2 - b2;
  }

  const sortedSheetsCode = [...sheetsCode].sort((a, b) => {
    return compareSheetCodeCodes(a.buchungsblattcode, b.buchungsblattcode);
  });

  return (
    <CustomCard title={title} style={{ marginBottom: "1rem" }}>
      <div>
        <div className="font-bold mb-3">Flurstücksinformationen</div>
        <div className="flex gap-10 max-[1000px]:flex-col">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content max-content",
              rowGap: "4px",
              columnGap: "2rem",
              gridAutoRows: "min-content",
            }}
          >
            <div>Flurstückenzeichen:</div>
            <div>{name}</div>
            <div>Gemeinde:</div>
            <div>Wuppertal</div>
            <div>Gemarkung:</div>
            <div>{gemarkung}</div>
            <div>Lage:</div>
            <div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <div className="">
                  {addresses.map((a, idx) => {
                    const number = a.alkis_adresse.nummer;
                    const street = a.alkis_adresse.strasse;
                    return (
                      <div key={idx}>
                        <span>
                          {number ? street + ", " : street} {number && number}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>Größe:</div>
            <div>
              {size} m<sup>2</sup>
            </div>
          </div>
          <div className="w-full">
            <Map extractor={landparcelExtractor} dataIn={extendedGeom} />
          </div>
        </div>
      </div>
      <Divider />
      <div className="font-bold">Buchungsblätter</div>
      <Tabs
        defaultActiveKey="0"
        tabPosition="left"
        destroyInactiveTabPane={true}
        items={sortedSheetsCode.map((b, i) => {
          const id = String(i);
          return {
            label: (
              <div style={{ padding: "4px 10px" }} className="text-primary">
                {b.buchungsblattcode}
              </div>
            ),
            key: id,
            children: (
              <div
                style={{ display: "flex", gap: "1.6rem" }}
                className="flex gap-6 max-[700px]:flex-col"
              >
                <div style={{ marginRight: "4rem" }}>
                  <div>Nr. {b.content.nrCode} auf</div>
                  <div>
                    <Link
                      to={`/alkis-buchungsblatt?id=${b.buchungsblattcode.trim()}&flurstueck=${alkisId}`}
                    >
                      <div className="text-primary">{`${b.buchungsblattcode}`}</div>
                    </Link>
                    {/* <a
                      href={`${urlPrefix}#/alkis-buchungsblatt?id=${b.buchungsblattcode.trim()}&flurstueck=${alkisId}`}
                    >
                      <div className="text-primary">{`${b.buchungsblattcode}`}</div>
                    </a> */}
                  </div>
                </div>
                <AdditionalSheet
                  owners={b.content.owners}
                  namesArr={b.content.namesArr}
                  legalDesc={b.content.legalDesc}
                />
              </div>
            ),
          };
        })}
      />
    </CustomCard>
  );
};
