import type { ReactNode } from "react";
import { Modal } from "antd";
import { CloseOutlined } from "@ant-design/icons";

export interface DialogTab {
  key: string;
  label: ReactNode;
}

interface AdvancedDialogProps {
  open: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: ReactNode;
  headerExtra?: ReactNode;
  tabs?: DialogTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  footerLeft?: ReactNode;
  footerRight: ReactNode;
  width?: number;
  // No side padding, for sidebar layouts that run edge to edge.
  flush?: boolean;
  children: ReactNode;
}

// Modal shell shared by the expert search and the CSV export settings.
const AdvancedDialog = ({
  open,
  onClose,
  icon,
  title,
  headerExtra,
  tabs = [],
  activeTab,
  onTabChange,
  footerLeft,
  footerRight,
  width = 1200,
  flush = false,
  children,
}: AdvancedDialogProps) => (
  <Modal
    open={open}
    onCancel={onClose}
    closable={false}
    width={width}
    centered
    styles={{
      content: { padding: 0, overflow: "hidden" },
      header: { padding: "20px 24px 0", margin: 0 },
      body: { padding: 0 },
      footer: { padding: "0 24px 16px", margin: 0 },
    }}
    title={
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 text-xl text-blue-600">
            {icon}
          </div>
          <h2 className="flex-1 min-w-0 text-lg font-semibold text-gray-900 mb-0">
            {title}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 border-none cursor-pointer transition-colors"
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-6 border-b border-gray-200 -mx-6 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              className={`flex items-center gap-2 text-sm pb-2 -mb-px border-b-2 bg-transparent cursor-pointer transition-colors ${
                activeTab === tab.key
                  ? "text-blue-600 border-blue-600 font-medium"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    }
    footer={
      <div className="flex justify-between items-center pt-3 border-t border-gray-100 -mx-6 px-6">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {footerLeft}
        </div>
        <div className="flex items-center gap-3">{footerRight}</div>
      </div>
    }
  >
    <div
      style={{
        height: "min(720px, calc(100vh - 160px))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingTop: 16,
          paddingLeft: flush ? 0 : 24,
          paddingRight: flush ? 0 : 24,
        }}
      >
        {children}
      </div>
    </div>
  </Modal>
);

export const FooterTextButton = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="text-[#6B7280] hover:text-[#4B5563] bg-transparent border-none cursor-pointer p-0 disabled:text-gray-300 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

export default AdvancedDialog;
