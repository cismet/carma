import {
  checkPdfProductPermission,
  getAllAdditionalSheets,
  productsPdfWithPermission,
  searchLandparcelByName,
} from "./apiMethods";
import { Divider, Tabs } from "antd";
import { getLandparcelTitle, pdfProductsLandparcel } from "./utility";
import AdditionalSheet from "../components/render/AdditionalSheet";
import CustomCard from "../components/ui/Card";
import { Link } from "react-router-dom";
import MapRender from "../components/commons/MapRender";
import { FilePdfOutlined } from "@ant-design/icons";
export const getLandparcelHtml = async (jwt, name, setError, setIsLoading) => {
  const landparcelData = await searchLandparcelByName(
    name,
    jwt,
    setError,
    setIsLoading
  );
  const landparcel = landparcelData.data.alkis_landparcel[0];
  const sheets = await getAllAdditionalSheets(
    landparcelData.data.alkis_landparcel[0].buchungsblaetterArray,
    jwt
  );
  const isAlkisProduct = await checkPdfProductPermission(
    "csa%3A%2F%2FalkisProduct@WUNDA_BLAU",
    jwt
  );
  const isBillingMode = await checkPdfProductPermission("billing.mode", jwt);
  console.log(
    "xxx isAlkisProduct",
    isAlkisProduct["csa://alkisProduct@WUNDA_BLAU"]
  );
  console.log("xxx isBillingMode", isBillingMode["billing.mode"]);
  const allPdfPermission = await productsPdfWithPermission(
    jwt,
    pdfProductsLandparcel
  );

  console.log("xxx allPdfPermission", allPdfPermission);

  const { alkis_id, flur, fstck_nenner, fstck_zaehler } =
    landparcelData.data.alkis_landparcel[0];
  const title = getLandparcelTitle(alkis_id, flur, fstck_nenner, fstck_zaehler);
  const lage = landparcel.adressenArray[0].alkis_adresse.strasse;

  const wrapStyle = { display: "flex" };
  const colStyle = { width: "35%" };

  return (
    <>
      <CustomCard title={title} style={{ marginBottom: "1rem" }}>
        <div className="flex gap-4 w-full">
          <div className="w-[35%]">
            <div className="font-bold mb-3">Flurstücksinformationen</div>
            <div className="w-[600px]">
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
                    return (
                      <div key={idx}>
                        {a.alkis_adresse.nummer}
                        {idx !== landparcel.adressenArray.length - 1 && ","}
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
          <div className="w-[65%]">
            <MapRender />
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
      <CustomCard style={{ marginBottom: "1rem" }} title="PDF-Produkte">
        <div>
          {allPdfPermission.map((p, idx) => {
            return (
              <div
                key={idx}
                className={`my-2 flex items-center gap-2 ${
                  p.permission ? "" : "text-gray-300"
                }`}
              >
                <FilePdfOutlined />
                <a
                  onClick={(e) => {
                    e.preventDefault();
                  }}
                  href="#"
                  className="cursor-pointer"
                >
                  {p.name}
                </a>
              </div>
            );
          })}
        </div>
      </CustomCard>
    </>
  );
};
