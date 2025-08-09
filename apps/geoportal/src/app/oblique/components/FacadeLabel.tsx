import React from "react";

type FacadeLabelProps = {
  text: string;
  fontSize: number;
};

const FacadeLabel: React.FC<FacadeLabelProps> = ({ text, fontSize }) => (
  <div
    className="absolute inset-0 grid place-items-center"
    style={{ pointerEvents: "none" }}
  >
    <div
      className="text-center uppercase font-black font-sans text-gray-400 leading-none"
      style={{ fontSize }}
    >
      {text}
    </div>
  </div>
);

export default FacadeLabel;
