import { useEffect } from "react";
import type { Cesium3DTileset, PrimitiveCollection } from "@carma-cesium";

import { useCesiumContext } from "./useCesiumContext";
import { applyTilesetSceneMember } from "../utils/sceneStyles";
import type { CesiumTilesetSceneMember } from "../index.d";

const removeTilesetFromSceneWithoutDestroy = (
  primitives: PrimitiveCollection,
  tileset: Cesium3DTileset
) => {
  const destroyPrimitives = primitives.destroyPrimitives;
  try {
    primitives.destroyPrimitives = false;
    primitives.remove(tileset);
  } finally {
    primitives.destroyPrimitives = destroyPrimitives;
  }
};

const missingTilesetSignature = (id: string) => `missing:${id}`;

export const useTilesets = () => {
  const ctx = useCesiumContext();
  const { currentSceneStyleConfig, tilesetIds } = ctx;

  useEffect(() => {
    let cancelled = false;
    let frameId: number | undefined;
    const visibleTilesetMembers =
      currentSceneStyleConfig?.members?.tilesets ?? [];
    const visibleTilesetMembersBySignature = new Map<
      string,
      CesiumTilesetSceneMember
    >();

    for (const member of visibleTilesetMembers) {
      const signature =
        ctx.getTilesetInitSignatureById(member.id) ??
        missingTilesetSignature(member.id);

      if (!visibleTilesetMembersBySignature.has(signature)) {
        visibleTilesetMembersBySignature.set(signature, member);
      } else {
        console.warn(
          "[STYLES|TILESET|CESIUM] Duplicate tileset init options in style",
          member.id
        );
      }
    }

    const syncTilesets = () => {
      let hasPendingTilesets = false;
      const loadedTilesets: Array<{
        id: string;
        tileset: Cesium3DTileset;
        primitives: PrimitiveCollection;
        signature: string;
        isInScene: boolean;
      }> = [];

      for (const id of tilesetIds) {
        const didSync = ctx.withTileset(id, (tileset, runtime) => {
          const { primitives } = runtime.scene;
          const signature =
            ctx.getTilesetInitSignatureById(id) ?? missingTilesetSignature(id);
          loadedTilesets.push({
            id,
            tileset,
            primitives,
            signature,
            isInScene: primitives.contains(tileset),
          });
          return true;
        });

        if (!didSync) {
          hasPendingTilesets = true;
        }
      }

      const representativeIdsBySignature = new Map<string, string>();
      for (const [signature] of visibleTilesetMembersBySignature) {
        const alreadyInScene = loadedTilesets.find(
          (record) => record.signature === signature && record.isInScene
        );
        const loaded = loadedTilesets.find(
          (record) => record.signature === signature
        );
        const representative = alreadyInScene ?? loaded;
        if (representative) {
          representativeIdsBySignature.set(signature, representative.id);
        }
      }

      for (const record of loadedTilesets) {
        const member = visibleTilesetMembersBySignature.get(record.signature);
        const representativeId = representativeIdsBySignature.get(
          record.signature
        );

        if (!member || representativeId !== record.id) {
          record.tileset.show = false;
          if (record.isInScene) {
            removeTilesetFromSceneWithoutDestroy(
              record.primitives,
              record.tileset
            );
          }
          continue;
        }

        if (!record.isInScene) {
          record.primitives.add(record.tileset);
        }
        record.tileset.show = true;
        applyTilesetSceneMember(record.tileset, member);
      }

      ctx.requestRender();

      if (hasPendingTilesets && !cancelled) {
        frameId = requestAnimationFrame(syncTilesets);
      }
    };

    syncTilesets();

    return () => {
      cancelled = true;
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [ctx, currentSceneStyleConfig, tilesetIds]);
};
