import config from "../../config_parser.ts";

export class Xor {
  static OBFUSCATION_KEY = (config.root.attributes.obfuscationKey || "0")
    .split("")
    .map((e: string) => e.charCodeAt(0));

  static apply(bytes: Uint8Array): Uint8Array {
    let i = bytes.length;

    while (i-- > 0) {
      bytes[i] ^= Xor.OBFUSCATION_KEY[i % Xor.OBFUSCATION_KEY.length];
    }

    return bytes;
  }
}
