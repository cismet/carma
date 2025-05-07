import React from "react";
import { type ControlComponent } from "../map-control";

export const filterControls = (control: ControlComponent, position: string) => {
  return control.position === position;
};

export const sortControls = (a: ControlComponent, b: ControlComponent) => {
  return a.order - b.order;
};
