import { Switch } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { getFilter, setFilter } from "../../store/slices/featureCollection";

const Filter = () => {
  const dispatch = useDispatch();
  const filter = useSelector(getFilter);

  return (
    <div>
      {Object.entries(filter).map(([key, { title, enabled }]) => (
        <Switch
          key={key}
          checkedChildren={title}
          unCheckedChildren={title}
          style={{ marginRight: "0.5rem" }}
          checked={enabled}
          onChange={(newVal) => dispatch(setFilter({ key, enabled: newVal }))}
        />
      ))}
    </div>
  );
};

export default Filter;
