import { Switch } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { getFilter, setFilter } from "../../store/slices/featureCollection";
import { FilterState } from "@carma-apps/belis-library";
import { useState } from "react";

const Filter = () => {
  const dispatch = useDispatch();
  const filterStateFromRedux = useSelector(getFilter);
  const [filterState, setFilterState] = useState(filterStateFromRedux);

  return (
    <div>
      {Object.keys(filterState).map((key) => {
        const item = filterState[key];
        return (
          <Switch
            key={key + "Switch"}
            checkedChildren={item.title}
            unCheckedChildren={item.title}
            style={{ marginTop: "0.6rem", marginRight: "0.5rem" }}
            onChange={(switched) => {
              const _fs = JSON.parse(JSON.stringify(filterState));
              _fs[key].enabled = switched;
              dispatch(setFilter(_fs));
              setFilterState(_fs);
            }}
            checked={item.enabled}
          />
        );
      })}
    </div>
  );
};

export default Filter;
