import { Switch } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { getFilter, setFilter } from "../../store/slices/featureCollection";
import { FilterState } from "@carma-apps/belis-library";

const Filter = () => {
  const dispatch = useDispatch();
  const filter = useSelector(getFilter);

  return (
    <div>
      {Object.entries(filter as FilterState).map(
        ([key, { title, enabled }], idx) => (
          <Switch
            key={key}
            checkedChildren={title}
            unCheckedChildren={title}
            style={{ marginRight: "0.5rem", marginTop: "0.5rem" }}
            checked={enabled}
            onChange={(newVal) => dispatch(setFilter({ key, enabled: newVal }))}
          />
        )
      )}
    </div>
  );
};

export default Filter;
