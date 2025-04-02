import { useEffect, useRef, useState } from "react";

const useCorrectAttributionControl = () => {
  const [attributionHeight, setAttributionHeight] = useState(0);
  const hash = window.location.hash;
  const queryString = hash.split("?")[1];
  const bgParam = useRef(new URLSearchParams(queryString).get("bg"));

  const calculateBottomGab = (newBg) => {
    setTimeout(() => {
      const attributionControl = document.querySelector(
        ".leaflet-control-attribution"
      );
      if (attributionControl) {
        attributionControl.style.marginLeft = "16px";
        attributionControl.style.marginTop = "2px";
        const height = attributionControl.getBoundingClientRect().height;
        setAttributionHeight(height);
      } else {
        setAttributionHeight(0);
      }
      bgParam.current = newBg;
    }, 50);
  };

  const buildBottomGap = () => {
    const hash = window.location.hash;
    const queryString = hash.split("?")[1];
    const searchParams = new URLSearchParams(queryString);
    const newBg = searchParams.get("bg");

    if (newBg !== bgParam.current) {
      calculateBottomGab(newBg);
    }
  };

  useEffect(() => {
    calculateBottomGab();
    window.addEventListener("popstate", buildBottomGap);

    const originalPushState = window.history.pushState;
    window.history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event("popstate"));
      return result;
    };

    return () => {
      window.removeEventListener("popstate", buildBottomGap);
      window.history.pushState = originalPushState;
    };
  }, []);

  return { attributionHeight };
};

export default useCorrectAttributionControl;
