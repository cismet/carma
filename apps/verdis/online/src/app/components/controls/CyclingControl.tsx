import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useDispatch, useSelector } from "react-redux";
import {
  getMapping,
  setSelectedBackgroundIndex,
} from "../../../store/slices/mapping";

export const CyclingControl = ({
  tooltipPostfix = " als Hintergrund",
  tooltipPrefix = "",
}) => {
  const dispatch = useDispatch();
  const mapping = useSelector(getMapping) as any;
  let newIndex = mapping.selectedBackgroundIndex + 1;
  const backgrounds = mapping.backgrounds;
  if (newIndex >= backgrounds.length) {
    newIndex = 0;
  }
  const baseUrl = window.location.origin + window.location.pathname;

  const clickHandler = () => {
    dispatch(setSelectedBackgroundIndex({ selectedBackgroundIndex: newIndex }));
  };

  return (
    <div className="flex flex-col">
      <ControlButtonStyler
        onClick={clickHandler}
        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
        title={`${tooltipPrefix}${
          backgrounds[mapping.selectedBackgroundIndex].title
        }${tooltipPostfix}`}
      >
        <div>
          <img
            src={baseUrl + backgrounds[mapping.selectedBackgroundIndex].src}
            width="28"
            height="30"
          />
        </div>
      </ControlButtonStyler>
    </div>
  );
};
