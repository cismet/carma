import { useRef } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";

const MainPage = () => {
  const storedJWT = useSelector(getJWT);

  let refRoutedMap = useRef(null);
  return (
    <div>
      <BelisMapLibWrapper
        refRoutedMap={refRoutedMap}
        width={1000}
        height={800}
        jwt={storedJWT}
      />
    </div>
  );
};

export default MainPage;
