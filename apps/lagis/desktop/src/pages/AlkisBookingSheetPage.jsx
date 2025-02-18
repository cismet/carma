import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { AlkisBookingSheetRenderer } from "@carma-apps/alkis-renderer";
import { getJWT } from "../store/slices/auth";

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
