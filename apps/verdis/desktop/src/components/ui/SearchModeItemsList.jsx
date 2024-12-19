import { faList, faSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Divider, Dropdown, Tooltip } from "antd";
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
                const trimmedItem = item;
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
    <Badge count={kassenzeichenliste.length} className="ml-auto">
      <Dropdown
        menu={{ items: searchResults }}
        placement="bottomRight"
        // size="small"
        overlayStyle={{
          maxHeight: "350px",
          maxWidth: "250px",
          overflow: "auto",
        }}
        // align={{
        //   offset: [0, 0],
        // }}
        // It fix miscalculation of placement
        getPopupContainer={(triggerNode) => triggerNode.parentNode}
        // dropdownRender={(menu) => {
        //   console.log("xxx searchResults", menu.props.items);

        //   return <div>123</div>;
        // }}
        // open={true}
      >
        <FontAwesomeIcon icon={faList} className="h-6 cursor-pointer" />
      </Dropdown>
    </Badge>
  );
};

export default SearchModeList;
