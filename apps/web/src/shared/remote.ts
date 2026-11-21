import { combine, createEffect, createEvent, createStore, sample } from "effector";

export type RemoteStatus = "loading" | "error" | "ready";

export function createRemote<Params, Data>({
  handler,
  initial,
}: {
  handler: (params: Params) => Promise<Data>;
  initial: Data;
}) {
  const reset = createEvent();
  const fx = createEffect<Params, Data, Error>(handler);
  const $data = createStore<Data>(initial);
  const $error = createStore("");
  const $isLoaded = createStore(false);

  const $status = combine(fx.pending, $isLoaded, $error, (pending, loaded, error): RemoteStatus => {
    if (error && !pending) {
      return "error";
    }
    if (!loaded) {
      return "loading";
    }
    return "ready";
  });

  // Back to the first-load state, so a screen that opens another item does not show the previous one.
  sample({
    clock: reset,
    fn: () => initial,
    target: $data,
  });

  sample({
    clock: reset,
    fn: () => false,
    target: $isLoaded,
  });

  sample({
    clock: fx.doneData,
    target: $data,
  });

  sample({
    clock: fx.doneData,
    fn: () => true,
    target: $isLoaded,
  });

  sample({
    clock: fx,
    target: $error.reinit,
  });

  sample({
    clock: fx.failData,
    fn: (error) => error.message,
    target: $error,
  });

  return {
    fx,
    reset,
    $data,
    $error,
    $status,
  };
}
