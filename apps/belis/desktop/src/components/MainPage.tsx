import { useRef } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
const MainPage = () => {
  const storedJWT = useSelector(getJWT);

  let refRoutedMap = useRef(null);
  // h-[calc(90%-20px)]
  return (
    <div className="mx-3 mt-1">
      <CustomCard title="Karte" style={{ marginBottom: "8px" }}>
        <BelisMapLibWrapper refRoutedMap={refRoutedMap} jwt={storedJWT} />
      </CustomCard>
    </div>
  );
};

export default MainPage;
