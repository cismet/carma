import { Slider, SliderSingleProps } from "antd";
import { useDispatch } from "react-redux";
import {
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  changeOpacity,
  changePaleOpacity,
  setFocusMode,
} from "../../store/slices/mapping";
import { useContext } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

interface OpacitySliderProps {
  isBackgroundLayer?: boolean;
  opacity: number;
  id: string;
}

const formatter: NonNullable<SliderSingleProps["tooltip"]>["formatter"] = (
  value
) => `${100 - value * 100}%`;

const OpacitySlider = ({
  isBackgroundLayer,
  opacity,
  id,
}: OpacitySliderProps) => {
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  return (
    <Slider
      min={0}
      max={1}
      tooltip={{ formatter: formatter }}
      onFocus={() => {
        routedMapRef?.leafletMap?.leafletElement.dragging.disable();
      }}
      step={0.1}
      onChange={(value) => {
        if (isBackgroundLayer) {
          dispatch(changeBackgroundOpacity({ opacity: value }));
          if (value !== 1) {
            dispatch(changePaleOpacity({ paleOpacityValue: value }));
            dispatch(setFocusMode(true));
          } else {
            dispatch(setFocusMode(false));
          }

          if (value !== 0) {
            dispatch(changeBackgroundVisibility(true));
          }
        } else {
          dispatch(changeOpacity({ id: id, opacity: value }));
        }
      }}
      className="w-full"
      value={opacity}
      onChangeComplete={() => {
        routedMapRef?.leafletMap?.leafletElement.dragging.enable();
      }}
    />
  );
};

export default OpacitySlider;
