// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useDispatch, useSelector } from "react-redux";
import {
  getMapping,
  setSelectedBackgroundIndex,
} from "../../store/slices/mapping";
import L from "leaflet";
import "leaflet-easybutton";
import "leaflet-easybutton/src/easy-button.css";
import { useEffect, useRef } from "react";

interface CyclingBackgroundButtonInterface {
  tooltipPrefix?: string;
  tooltipPostfix?: string;
  mapRef: any;
}

interface ExtendedEasyButton extends L.EasyButton {
  button: HTMLElement;
}

const CyclingBackgroundButton = ({
  tooltipPostfix = " als Hintergrund",
  tooltipPrefix = "",
  mapRef,
}: CyclingBackgroundButtonInterface) => {
  const dispatch = useDispatch();
  const bgButtonInstanceRef = useRef<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapping = useSelector(getMapping) as any;
  let newIndex = mapping.selectedBackgroundIndex + 1;
  const backgrounds = mapping.backgrounds;
  // let leafletElement = mapRef.current.leafletMap.leafletElement;

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
      stateName: "bg-" + i,
      icon: `<img width="28" height="28" src="${backgrounds[newI].src}"/>`,
      onClick: function (control) {
        control.state("bg-" + newI);
        dispatch(setSelectedBackgroundIndex({ selectedBackgroundIndex: newI }));
      },
      title: `${tooltipPrefix}${backgrounds[newI].title}${tooltipPostfix}`,
      // title: `${backgrounds[newI].title}${tooltipPostfix}`,
    };
    buttonStates.push(state);
  }

  useEffect(() => {
    const map = mapRef.current.leafletMap.leafletElement;
    setTimeout(() => {
      if (map && !bgButtonInstanceRef.current) {
        const leafletElement = L.easyButton({
          states: buttonStates,
          // position: "topleft",
        });
        leafletElement.button.style.padding = "1px";
        leafletElement.button.style.lineHeight = "24px";
        leafletElement.state("bg-" + mapping.selectedBackgroundIndex);
        leafletElement.addTo(map);
        bgButtonInstanceRef.current = true;
        // map.addControl(leafletElement);
      }
    }, 0);
  }, []);

  return <div></div>;
};

export default CyclingBackgroundButton;
