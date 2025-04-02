import { useEffect } from "react";

const useCorrectHTMLSizes = () => {
  useEffect(() => {
    const attributionControl = document.querySelector(
      ".leaflet-control-attribution"
    );
    if (attributionControl) {
      attributionControl.style.marginLeft = "16px";
      attributionControl.style.marginTop = "2px";
    }

    // const bottomControlsNodes = document.querySelectorAll(".leaflet-control");
    // const target = Array.from(bottomControlsNodes).find((el) =>
    //   el.textContent?.includes("Legende Gebäudegefährdung")
    // );

    // console.log("xxx bottomControlsNodes", bottomControlsNodes);
    // console.log("xxx target", target);

    // if (target) {
    //   const container = target.closest("div");
    //   console.log("xxx container", container);

    //   if (target) {
    //     container.style.width = "350px";
    //     container.style.border = "1px solid red";
    //   }
    // }
  }, []);
  return null;
};

export default useCorrectHTMLSizes;
