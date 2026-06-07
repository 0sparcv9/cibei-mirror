type LimitedSet = Map<string, Uint8Array> & {
  register(arr: Uint8Array): string;
};

const clients = new Proxy(new Map(), {
  get(target, prop, _receiver) {
    switch (prop) {
      case "register": {
        return (arr: Uint8Array) => {
          const uuid = crypto.randomUUID();

          target.set(uuid, arr);

          return uuid;
        };
      }

      default: {
        return Reflect.get(target, prop);
      }
    }
  },
}) as LimitedSet;

export default clients;
