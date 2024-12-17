import { faList, faSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Dropdown, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getKassenzeichenliste } from "../../store/slices/searchMode";
import { searchForKassenzeichen } from "../../store/slices/search";
import { useSearchParams } from "react-router-dom";

const SearchModeList = () => {
  const kassenzeichenliste = useSelector(getKassenzeichenliste);
  const [searchResults, setSearchResults] = useState([]);
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  const items = [];
  useEffect(() => {
    if (kassenzeichenliste.length > 0) {
      const res = [];
      kassenzeichenliste.forEach((item, idx) => {
        res.push({
          label: (
            <div
              className="flex justify-center items-center gap-2 px-1"
              onClick={() => {
                const trimmedItem = item.trim();
                dispatch(searchForKassenzeichen(item));
                setUrlParams({ kassenzeichen: trimmedItem });
              }}
            >
              <FontAwesomeIcon icon={faSquare} />
              <span>{item}</span>
            </div>
          ),
          key: idx,
        });
      });

      setSearchResults(res);
    }
  }, [kassenzeichenliste]);
  return (
    <Badge count={kassenzeichenliste.length}>
      <Dropdown menu={{ items: searchResults }} placement="bottomRight">
        <FontAwesomeIcon icon={faList} className="h-6 cursor-pointer" />
      </Dropdown>
    </Badge>
  );
};

export default SearchModeList;
