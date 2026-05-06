import { useEffect, useState } from "react";
import {
  useSystemMessages,
  type SystemMessageSeverity,
} from "../hooks/useSystemMessages";

interface SystemMessageBannerProps {
  appKey: string | undefined;
  slot: string;
  className?: string;
  onVisibilityChange?: (visible: boolean) => void;
}

const severityClasses: Record<SystemMessageSeverity, string> = {
  info: "bg-blue-500 text-white",
  warning: "bg-yellow-300 text-black",
  danger: "bg-red-600 text-white",
};

export const SystemMessageBanner = ({
  appKey,
  slot,
  className,
  onVisibilityChange,
}: SystemMessageBannerProps) => {
  const messages = useSystemMessages(appKey, slot);
  const message = messages[0];

  const [visible, setVisible] = useState(true);
  const [progressWidth, setProgressWidth] = useState("100%");

  useEffect(() => {
    onVisibilityChange?.(!!message && visible);
  }, [message, visible, onVisibilityChange]);

  useEffect(() => {
    if (!message?.hideAfter) return;
    setVisible(true);
    setProgressWidth("100%");
    const ms = message.hideAfter * 1000;
    const raf = requestAnimationFrame(() => setProgressWidth("0%"));
    const hide = setTimeout(() => setVisible(false), ms);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
    };
  }, [message?.hideAfter, message?.content]);

  if (!message || !visible) return null;

  const severity = message.severity ?? "warning";
  const hasCustomColors = !!message.bg || !!message.fg;
  const colorClasses = hasCustomColors ? "" : severityClasses[severity];
  const transitionMs = message.hideAfter ? message.hideAfter * 1000 : 0;
  const inlineStyle = hasCustomColors
    ? { backgroundColor: message.bg, color: message.fg }
    : undefined;

  return (
    <div
      className={`relative ${colorClasses} text-base font-medium text-center py-2 px-6 ${
        className ?? ""
      }`}
      style={inlineStyle}
    >
      {message.content}
      {message.hideAfter ? (
        <div
          className="absolute bottom-0 left-0 h-px bg-gray-500"
          style={{
            width: progressWidth,
            transition: `width ${transitionMs}ms linear`,
          }}
        />
      ) : null}
    </div>
  );
};

export default SystemMessageBanner;
