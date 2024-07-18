import { useDispatch, useSelector } from 'react-redux';
import {
  getMapping,
  setSelectedBackgroundIndex,
} from '../../store/slices/mapping';
import L from 'leaflet';
import 'leaflet-easybutton';
import 'leaflet-easybutton/src/easy-button.css';

interface CyclingBackgroundButtonInterface {
  tooltipPrefix?: string;
  tooltipPostfix?: string;
  mapRef: any;
}

const CyclingBackgroundButton = ({
  tooltipPostfix = ' als Hintergrund',
  tooltipPrefix,
  mapRef,
}: CyclingBackgroundButtonInterface) => {
  const dispatch = useDispatch();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapping = useSelector(getMapping) as any;
  let newIndex = mapping.selectedBackgroundIndex + 1;
  const backgrounds = mapping.backgrounds;
  let leafletElement = mapRef.current.leafletMap.leafletElement;

  if (newIndex >= backgrounds.length) {
    newIndex = 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buttonStates: any[] = [];

  for (let i = 0; i < backgrounds.length; ++i) {
    let newI = i + 1;
    if (newI >= backgrounds.length) {
      newI = 0;
    }
    let state = {
      stateName: 'bg-' + i,
      icon: `<img width="28" height="28" src="${backgrounds[newI].src}"/>`,
      onClick: function (control) {
        control.state('bg-' + newI);
        dispatch(setSelectedBackgroundIndex({ selectedBackgroundIndex: newI }));
      },
      title: `${tooltipPrefix}${backgrounds[newI].title}${tooltipPostfix}`,
    };
    buttonStates.push(state);
  }

  leafletElement = L.easyButton({
    states: buttonStates,
  });
  leafletElement.button.style.padding = '1px';
  leafletElement.button.style.lineHeight = '24px';
  leafletElement.state('bg-' + mapping.selectedBackgroundIndex);
  console.log('xxx', leafletElement);
  console.log('xxx', mapRef.current.leafletMap.leafletElement);
  return <div></div>;
};

export default CyclingBackgroundButton;
