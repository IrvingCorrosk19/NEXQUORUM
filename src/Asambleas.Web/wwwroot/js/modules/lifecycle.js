/**
 * Module lifecycle helpers for hybrid soft-routing.
 * Contract: mount(ctx) / unmount() / canLeave() / restoreState() / dispose()
 */

export function createLifecycle({ name }) {
  let mounted = false;
  let abort = null;
  const cleanups = [];

  return {
    get name() {
      return name;
    },
    get signal() {
      return abort?.signal;
    },
    get isMounted() {
      return mounted;
    },
    beginMount() {
      if (mounted) {
        throw new Error(`lifecycle(${name}): already mounted`);
      }
      abort = new AbortController();
      mounted = true;
      return abort.signal;
    },
    onCleanup(fn) {
      if (typeof fn === "function") cleanups.push(fn);
    },
    async unmount() {
      if (!mounted) return;
      mounted = false;
      try {
        abort?.abort();
      } catch {
        /* ignore */
      }
      abort = null;
      while (cleanups.length) {
        const fn = cleanups.pop();
        try {
          await fn();
        } catch {
          /* ignore */
        }
      }
    },
    async dispose() {
      await this.unmount();
    }
  };
}

export function listen(target, type, handler, options, life) {
  if (!target) return;
  target.addEventListener(type, handler, options);
  life?.onCleanup(() => target.removeEventListener(type, handler, options));
}