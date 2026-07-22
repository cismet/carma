declare module "three/addons/libs/zstddec.module.js" {
  export class ZSTDDecoder {
    init(): Promise<void>;
    decode(data: Uint8Array, uncompressedSize?: number): Uint8Array;
  }
}
