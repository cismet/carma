type FloodingmapControlState = {
  selectedSimulation?: number;
};

export const canEnableFloodingmapInfoToggle = (
  controlState: FloodingmapControlState
): boolean => controlState.selectedSimulation !== 2;

export const deriveFloodingmapInfoToggleState = (
  toggleState: boolean,
  controlState: FloodingmapControlState
): boolean => canEnableFloodingmapInfoToggle(controlState) && toggleState;
