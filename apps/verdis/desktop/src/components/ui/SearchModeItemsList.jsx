import { faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getKassenzeichenliste } from "../../store/slices/searchMode";

const SearchModeList = () => {
  const kassenzeichenliste = useSelector(getKassenzeichenliste);
  useEffect(() => {
    console.log("xxx kassenzeichenliste", kassenzeichenliste);
  }, [kassenzeichenliste]);
  return (
    <Tooltip title="Kassenzeichenliste">
      <div className="relative flex cursor-pointer items-center justify-center">
        <FontAwesomeIcon icon={faList} className={`h-6`} />
      </div>
    </Tooltip>
  );
};

export default SearchModeList;
