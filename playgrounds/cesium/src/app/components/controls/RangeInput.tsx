import { FC } from 'react';
import { useDispatch, useSelector } from 'react-redux';

interface ControlProps {
  title: string;
  valueSelector: (state) => number;
  actionCreator: (value: number) => { type: string; payload: number };
}

const RangeInput: FC<ControlProps> = ({
  title,
  valueSelector,
  actionCreator,
}) => {
  const dispatch = useDispatch();
  const value = useSelector(valueSelector);

  return (
    <input
      title={title}
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(event) =>
        dispatch(actionCreator(parseFloat(event.target.value)))
      }
    />
  );
};

export default RangeInput;
