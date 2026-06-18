
export default class DisposableMap<T, U extends { close: () => void }> extends Map<T, U> {
  constructor() {
    super();
  }

  [Symbol.dispose]() {
    console.log("DisposableMap: dispose");

    for (const [_, val] of this) {
      val.close();
    }

    this.clear();
  }
}