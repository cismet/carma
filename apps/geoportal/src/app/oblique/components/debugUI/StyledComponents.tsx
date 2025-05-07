import { styled } from "styled-components";

// Container for debug components that will arrange them vertically
export const DebugComponentsContainerRight = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 450px;
  max-width: calc(100vw - 20px);
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 1000;
`;

export const DebugComponentsContainerLeft = styled.div`
  position: absolute;
  top: 10px;
  left: 60px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 1000;
`;
