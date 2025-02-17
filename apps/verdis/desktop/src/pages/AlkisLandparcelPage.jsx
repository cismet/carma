import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";
import { AlkisRenderer } from "@carma-apps/alkis-renderer";

const AlkisLandparcelPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const jwt = useSelector(getJWT);

  return <AlkisRenderer landparcelId={id} jwt={jwt} />;
};

export default AlkisLandparcelPage;
