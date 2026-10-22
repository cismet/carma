import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Dropdown } from "antd";
import Icon from "react-cismap/commons/Icon";

export type SubAction = {
  title: string;
  onClick: () => void;
  iconname?: string;
  /** Icon element in front of the title, e.g. a FontAwesomeIcon. */
  iconspan?: ReactNode;
};

// Root element of ResponsiveInfoBox.
const INFO_BOX_SELECTOR = '[data-test-id="info-box"]';
const GAP_ABOVE_INFO_BOX = 4;

/**
 * Upward menu of sub actions, as "Störung melden" in belis-online.
 *
 * `clearOfInfoBox`: for triggers inside the infobox (the small icons in its
 * title row). The menu then opens above the top edge of the box instead of
 * right above the trigger, so it does not cover the box.
 */
export const SubActionsDropUp = ({
  subs,
  clearOfInfoBox = false,
  style,
  children,
}: {
  subs: SubAction[];
  clearOfInfoBox?: boolean;
  /** Style of the element wrapping the trigger. */
  style?: CSSProperties;
  children: ReactNode;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [offsetY, setOffsetY] = useState(0);

  // Measured on pointer down, i.e. before the click opens the menu.
  const measureOffset = () => {
    if (!clearOfInfoBox || !triggerRef.current) return;
    const box = triggerRef.current.closest(INFO_BOX_SELECTOR);
    if (!box) return;
    setOffsetY(
      box.getBoundingClientRect().top -
        triggerRef.current.getBoundingClientRect().top -
        GAP_ABOVE_INFO_BOX
    );
  };

  const items = subs.map((sub, index) => ({
    key: index,
    onClick: sub.onClick,
    label: (
      <h4>
        <span style={{ marginRight: 10, opacity: 0.5 }}>
          {sub.iconname && <Icon name={sub.iconname} />}
          {sub.iconspan}
        </span>
        <span style={{ margin: 3 }}>{sub.title}</span>
      </h4>
    ),
  }));

  return (
    <Dropdown
      menu={{ items, style: { opacity: 0.8 } }}
      placement="topRight"
      trigger={["click"]}
      align={clearOfInfoBox ? { offset: [0, offsetY] } : undefined}
    >
      <span
        ref={triggerRef}
        onPointerDown={measureOffset}
        style={{ cursor: "pointer", ...style }}
      >
        {children}
      </span>
    </Dropdown>
  );
};
