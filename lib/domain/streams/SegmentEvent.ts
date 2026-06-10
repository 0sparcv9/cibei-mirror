
export default class TCPSegmentEvent extends MessageEvent<Uint8Array> {
  constructor(
    type: string,
    eventInitDict: MessageEventInit<Uint8Array>
  ) {
    super(type, eventInitDict);
  }

  public static attach(
    readable: ReadableStream<Uint8Array<ArrayBuffer>>
  ): EventTarget {
    const reader = readable.getReader();

    const target = new EventTarget();

    queueMicrotask(async () => {
      try {
      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          target.dispatchEvent(new TCPSegmentEvent("close", {}));

          break;
        }

        target.dispatchEvent(new TCPSegmentEvent("segment", {
          data: value
        }))
      }
      } catch(e) {
        console.error(e);
      }

      reader.releaseLock();
    })

    return target;
  }
}