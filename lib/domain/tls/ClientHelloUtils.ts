
export default class ClientHelloUtils {
  public static exfiltrateTlsSni(
    packet: Uint8Array,
  ) {
    if (
      packet.length < 48 ||
      packet[0] !== 0x16 ||
      packet[5] !== 0x01
    ) {
      return null;
    }

    for (let i = 0; i <= packet.length - 9; i++) {
      if (packet[i] === 0xfe && packet[i + 1] === 0x0d) {
        console.log("Got CH with encrypted extensions");

        return "[ech]";
      }

      if (
        packet[i] === 0x00 &&
        packet[i + 1] === 0x00 &&
        packet[i + 6] === 0x00 &&
        (packet[i + 3] - packet[i + 5]) === 2
      ) {
        const len = packet[i + 8];

        const start = i + 9;

        const end = start + len;

        if (end <= packet.length && len > 0 && len < 256) {
          const decoder = new TextDecoder();

          return decoder.decode(packet.slice(start, end));
        }
      }
    }

    return null;
  };
}