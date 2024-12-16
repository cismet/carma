import { faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Tooltip } from "antd";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getKassenzeichenliste } from "../../store/slices/searchMode";
import Dot from "../commons/Dot";

const SearchModeList = () => {
  const kassenzeichenliste = useSelector(getKassenzeichenliste);
  useEffect(() => {
    console.log("xxx kassenzeichenliste", kassenzeichenliste.length);
  }, [kassenzeichenliste]);
  return (
    <Badge count={kassenzeichenliste.length} showZero>
      <FontAwesomeIcon icon={faList} className="h-6 cursor-pointer" />
    </Badge>
  );
};

export default SearchModeList;
