import type { ControlSlot } from "../control-registry";

export const filterControls = (control: ControlSlot, position: string) => {
  return control.position === position;
};

export const sortControls = (a: ControlSlot, b: ControlSlot) => {
  return a.order - b.order;
};
