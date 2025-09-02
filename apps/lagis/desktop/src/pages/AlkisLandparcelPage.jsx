import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { AlkisRenderer } from "@carma-appframeworks/alkis";
import { getJWT } from "../store/slices/auth";

const AlkisLandparcelPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const jwt = useSelector(getJWT);

  return <AlkisRenderer landparcelId={id} jwt={jwt} />;
};

export default AlkisLandparcelPage;
