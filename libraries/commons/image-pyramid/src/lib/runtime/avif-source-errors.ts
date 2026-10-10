/** A concrete server response; network failures and aborts keep their own types. */
export class AvifHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly expectedStatus = 206
  ) {
    super(
      `AVIF requires HTTP ${expectedStatus}; refusing ${status} full-file response`
    );
    this.name = "AvifHttpError";
  }
}
export class AvifAssetChangedError extends Error {
  constructor() {
    super("AVIF asset changed while reading (representation changed)");
    this.name = "AvifAssetChangedError";
  }
}
export class AvifRepresentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvifRepresentationError";
  }
}
export class NativeAvifFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeAvifFormatError";
  }
}
