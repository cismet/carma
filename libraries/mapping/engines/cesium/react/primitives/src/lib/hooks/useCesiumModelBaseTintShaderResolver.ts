import { useCallback, useEffect, useRef } from "react";

import type { Color, CustomShader } from "@carma-cesium";

import {
  createModelSelectionHighlightShader,
  setModelBaseTintShaderUniforms,
} from "../utils/modelHighlightShader";

type ResolveModelBaseTintShaderOptions = {
  enabled: boolean;
  key: string;
  tintColor: Color;
  tintMix: number;
};

type UseCesiumModelBaseTintShaderResolverOptions = {
  activeKeys: readonly string[];
};

export const useCesiumModelBaseTintShaderResolver = ({
  activeKeys,
}: UseCesiumModelBaseTintShaderResolverOptions) => {
  const shaderByKeyRef = useRef<Map<string, CustomShader>>(new Map());

  useEffect(() => {
    const activeKeySet = new Set(activeKeys);
    shaderByKeyRef.current.forEach((_shader, key) => {
      if (!activeKeySet.has(key)) {
        shaderByKeyRef.current.delete(key);
      }
    });
  }, [activeKeys]);

  return useCallback(
    ({
      enabled,
      key,
      tintColor,
      tintMix,
    }: ResolveModelBaseTintShaderOptions): CustomShader | undefined => {
      if (!enabled) {
        return undefined;
      }

      const shaderByKey = shaderByKeyRef.current;
      let shader = shaderByKey.get(key);
      if (!shader) {
        shader = createModelSelectionHighlightShader({
          opacity: 0,
          tintColor,
          tintMix,
        });
        shaderByKey.set(key, shader);
      }

      setModelBaseTintShaderUniforms({
        shader,
        tintColor,
        tintMix,
      });
      return shader;
    },
    []
  );
};
