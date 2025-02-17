import React from "react";
import {
  checkPdfProductPermission,
  getAllAdditionalSheets,
  productsPdfWithPermission,
  searchLandparcelByName,
} from "../utils/apiMethods";
import { Divider, Spin, Tabs } from "antd";
import {
  getLandparcelTitle,
  landparcelExtractor,
  pdfProductsLandparcel,
} from "../utils/helper";
import { AdditionalSheet } from "../components/AdditionalSheet";
import { CustomCard } from "../components/CustomCard";
import { Map } from "../components/Map";
import { Link } from "react-router-dom";
import PdfDocumentLoader from "../components/PdfDocumentLoader";
export const getLandparcelHtml = async (jwt, name, setError, setIsLoading) => {
  const landparcelData = await searchLandparcelByName(
    name,
    jwt,
    setError,
    setIsLoading
  );

  const geometry =
    landparcelData.data.alkis_landparcel[0].extended_geom.geo_field;

  const extentdedGeom = {
    type: "Feature",
    geometry: {
      type: geometry.type,
      coordinates: geometry.coordinates,
    },
    crs: geometry.crs,
  };

  const landparcel = landparcelData.data.alkis_landparcel[0];
  const sheets = await getAllAdditionalSheets(
    landparcelData.data.alkis_landparcel[0].buchungsblaetterArray,
    jwt
  );

  const { alkis_id, flur, fstck_nenner, fstck_zaehler } =
    landparcelData.data.alkis_landparcel[0];

  const isAlkisProduct = await checkPdfProductPermission(
    "csa%3A%2F%2FalkisProduct",
    jwt
  );
  const isBillingMode = await checkPdfProductPermission("billing.mode", jwt);

  const allPdfPermission = await productsPdfWithPermission(
    jwt,
    pdfProductsLandparcel,
    isAlkisProduct["csa://alkisProduct@WUNDA_BLAU"],
    isBillingMode["billing.mode@WUNDA_BLAU"]
  );

  const title = getLandparcelTitle(alkis_id, flur, fstck_nenner, fstck_zaehler);
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;

  const wrapStyle = { display: "flex" };
  const colStyle = { width: "35%" };

  return (
    <>
      <CustomCard title={title} style={{ marginBottom: "1rem" }}>
        <div className="flex gap-4 w-full max-[1000px]:flex-col">
          <div className="w-[35%]">
            <div className="font-bold mb-3">Flurstücksinformationen</div>
            <div className="w-[500px]">
              <div style={wrapStyle}>
                <div style={colStyle}>Flurstückenzeichen:</div>
                <div style={colStyle}>{name}</div>
              </div>
              <div style={wrapStyle}>
                <div style={colStyle}>Gemeinde:</div>
                <div>Wuppertal</div>
              </div>
              <div style={wrapStyle}>
                <div style={colStyle}>Gemarkung:</div>
                <div>{landparcel.gemarkung}</div>
              </div>
              <div style={wrapStyle}>
                <div style={colStyle}>Lage:</div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <div>{lage}</div>
                  {landparcel.adressenArray.map((a, idx) => {
                    const nummer = a.alkis_adresse.nummer;
                    console.log(
                      "xxx nummer idx",
                      idx,
                      idx === landparcel.adressenArray.length - 1
                    );
                    return (
                      <div key={idx}>
                        {idx !== landparcel.adressenArray.length - 1
                          ? nummer.trim() + ","
                          : nummer.trim()}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={wrapStyle}>
                <div style={colStyle}>Größe:</div>
                <div>
                  {landparcel.groesse} m<sup>2</sup>
                </div>
              </div>
            </div>
          </div>
          <div className="w-[65%] max-[1000px]:w-[100%]">
            <Map extractor={landparcelExtractor} dataIn={extentdedGeom} />
          </div>
        </div>
        <Divider />
        <div className="font-bold">Buchungsblätter</div>
        <Tabs
          defaultActiveKey="0"
          tabPosition="left"
          destroyInactiveTabPane={true}
          items={sheets.map((b, i) => {
            const id = String(i);
            return {
              label: (
                <div style={{ padding: "4px 10px" }}>{b.buchungsblattcode}</div>
              ),
              key: id,
              children: (
                <div style={{ display: "flex", gap: "1.6rem" }}>
                  <div style={{ marginRight: "4rem" }}>
                    <div>Nr. {b.content.nrCode} auf</div>
                    <div>
                      <Link
                        to={`/alkis-buchungsblatt?id=${b.buchungsblattcode.trim()}&flurstueck=${alkis_id}`}
                      >
                        <div className="text-primary">{`${b.buchungsblattcode}`}</div>
                      </Link>
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
      <PdfDocumentLoader
        loadingCode={alkis_id}
        allPdfPermission={allPdfPermission}
        jwt={jwt}
      />
    </>
  );
};
