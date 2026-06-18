const DEBUG = true;

console.log = new Proxy(console.log, {
  apply(target, that, args) {
    if (!DEBUG) return;

    return target.apply(that, args);
  },
});
