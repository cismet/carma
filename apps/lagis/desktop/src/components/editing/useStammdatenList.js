import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import {
  ensureStammdatenList,
  getStammdatenList,
} from "../../store/slices/stammdaten";

// loads the list the first time a block needs it; Redux keeps it afterwards
const useStammdatenList = (name, enabled) => {
  const dispatch = useDispatch();
  const list = useSelector(getStammdatenList(name));

  useEffect(() => {
    if (enabled && !list) {
      dispatch(ensureStammdatenList(name)).catch((error) => {
        console.error(
          `Stammdaten "${name}" konnten nicht geladen werden`,
          error
        );
        message.error("Die Auswahllisten konnten nicht geladen werden.");
      });
    }
  }, [dispatch, enabled, list, name]);

  return list;
};

export default useStammdatenList;
