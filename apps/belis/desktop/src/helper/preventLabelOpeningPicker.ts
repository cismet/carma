// Clicking a Form.Item label forwards the click to its control (htmlFor). For
// antd DatePickers that opens the popup before it is positioned, so it flashes
// in the top-left corner. Cancel that forwarded click for picker inputs only.
export const preventLabelOpeningPicker = (): void => {
  document.addEventListener(
    "click",
    (e) => {
      const label = (e.target as Element | null)?.closest?.("label");
      if (label?.control?.closest(".ant-picker")) e.preventDefault();
    },
    true
  );
};
