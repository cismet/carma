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
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();

  const updateKassenzeichen = (item) => {
    const currentParams = Object.fromEntries(urlParams.entries());
    const updatedParams = {
      ...currentParams,
      kassenzeichen: item,
    };
    setUrlParams(updatedParams);
  };

  const updateOneKassenzeichen = (item) => {
    dispatch(searchForKassenzeichen("" + item));
  };

  useEffect(() => {
    if (kassenzeichenliste.length === 1) {
      updateKassenzeichen(kassenzeichenliste[0]);
    }
  }, [kassenzeichenliste]);

  return (
    <Badge
      count={kassenzeichenliste.length > 99 ? "99+" : kassenzeichenliste.length}
      className="ml-auto"
    >
      <Dropdown
        menu={{
          items: kassenzeichenliste.map((item, idx) => {
            return {
              label: (
                <div
                  className="flex justify-center items-center gap-2 px-1"
                  onClick={() =>
                    kassenzeichenliste.length === 1
                      ? updateOneKassenzeichen(item)
                      : updateKassenzeichen(item)
                  }
                >
                  <FontAwesomeIcon icon={faSquare} />
                  <span>{item}</span>
                </div>
              ),
              key: idx,
            };
          }),
        }}
        placement="bottomRight"
        overlayStyle={{
          maxHeight: "350px",
          maxWidth: "250px",
          overflow: "auto",
        }}
        getPopupContainer={(triggerNode) => triggerNode.parentNode}
      >
        <FontAwesomeIcon icon={faList} className="h-6 cursor-pointer" />
      </Dropdown>
    </Badge>
  );
};

export default SearchModeList;
