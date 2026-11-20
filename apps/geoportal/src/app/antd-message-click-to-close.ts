import { isValidElement } from "react";
import { message } from "antd";
import type { ArgsProps, MessageInstance } from "antd/es/message/interface";

const NOTICE_METHODS = [
  "open",
  "info",
  "success",
  "warning",
  "error",
  "loading",
] as const;

const isArgsProps = (content: unknown): content is ArgsProps =>
  typeof content === "object" &&
  content !== null &&
  !isValidElement(content) &&
  "content" in content;

// Mutates the api in place so every caller (static or hook) gets click-to-close.
const patchMessageApi = (api: MessageInstance) => {
  for (const method of NOTICE_METHODS) {
    const original = api[method] as (...args: unknown[]) => () => void;
    (api as unknown as Record<string, unknown>)[method] = (
      content: unknown,
      ...rest: unknown[]
    ) => {
      const config: ArgsProps = isArgsProps(content)
        ? content
        : { content: content as ArgsProps["content"] };
      const close = original(
        {
          ...config,
          onClick: (e) => {
            config.onClick?.(e);
            close();
          },
        },
        ...rest
      );
      return close;
    };
  }
  return api;
};

const patchedHookApis = new WeakSet<MessageInstance>();

export const enableAntdMessageClickToClose = () => {
  patchMessageApi(message as unknown as MessageInstance);
  const originalUseMessage = message.useMessage;
  message.useMessage = (...args) => {
    const [api, holder] = originalUseMessage(...args);
    // antd memoizes the hook api, so patch each instance only once
    if (!patchedHookApis.has(api)) {
      patchedHookApis.add(api);
      patchMessageApi(api);
    }
    return [api, holder];
  };
};
