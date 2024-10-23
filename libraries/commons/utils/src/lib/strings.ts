const CHARSET_ALPHANUMERIC_MIXED_CASE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_STRING_LENGTH = 5;

export function generateRandomString(
  length: number = DEFAULT_STRING_LENGTH,
  charSet: string = CHARSET_ALPHANUMERIC_MIXED_CASE,
): string {
  let result = "";
  let charactersLength = charSet.length;
  for (let i = 0; i < length; i++) {
    result += charSet.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
