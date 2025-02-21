import React from "react";
import {
  checkPdfProductPermission,
  getAllAdditionalSheets,
  productsPdfWithPermission,
  searchLandparcelByName,
} from "../utils/apiMethods";
import { getLandparcelTitle, pdfProductsLandparcel } from "../utils/helper";
import PdfDocumentLoader from "../components/PdfDocumentLoader";
import { LandparcelInfo } from "../components/LandparcelInfo";
export const getLandparcelHtml = async (
  jwt,
  name,
  setError,
  setIsLoading,
  isLoading
) => {
  const landparcelData = await searchLandparcelByName(
    name,
    jwt,
    setError,
    setIsLoading
  );

  const geometry =
    landparcelData.data.alkis_landparcel[0].extended_geom.geo_field;

  const extendedGeom = {
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
    jwt,
    setError,
    setIsLoading
  );

  const { alkis_id, flur, fstck_nenner, fstck_zaehler } =
    landparcelData.data.alkis_landparcel[0];

  const isAlkisProduct = await checkPdfProductPermission(
    "csa%3A%2F%2FalkisProduct",
    jwt,
    setError,
    setIsLoading
  );
  const isBillingMode = await checkPdfProductPermission(
    "billing.mode",
    jwt,
    setError,
    setIsLoading
  );

  const allPdfPermission = await productsPdfWithPermission(
    jwt,
    pdfProductsLandparcel,
    isAlkisProduct["csa://alkisProduct@WUNDA_BLAU"],
    isBillingMode["billing.mode@WUNDA_BLAU"],
    setError,
    setIsLoading
  );

  const title = getLandparcelTitle(alkis_id, flur, fstck_nenner, fstck_zaehler);

  return (
    <>
      <LandparcelInfo
        title={title}
        addresses={landparcel.adressenArray}
        alkisId={alkis_id}
        extendedGeom={extendedGeom}
        gemarkung={landparcel.gemarkung}
        name={name}
        sheetsCode={sheets}
        size={landparcel.groesse}
        isLoading={isLoading}
      />

      <PdfDocumentLoader
        loadingCode={alkis_id}
        allPdfPermission={allPdfPermission}
        jwt={jwt}
      />
    </>
  );
};
