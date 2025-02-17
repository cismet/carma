import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";
import { AlkisBookingSheetRenderer } from "@carma-apps/alkis-renderer";

const AlkisBookingSheetPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const flurstueck = searchParams.get("flurstueck");
  const jwt = useSelector(getJWT);

  return (
    <AlkisBookingSheetRenderer id={id} jwt={jwt} flurstueck={flurstueck} />
  );
};

export default AlkisBookingSheetPage;
