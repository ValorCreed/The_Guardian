import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';


export class ScreenRequestCancelledError extends Error {
  constructor() {
    super('The request was cancelled because the screen is no longer active.');
    this.name = 'ScreenRequestCancelledError';
    this.stack = undefined;
  }
}

export const isScreenRequestCancelled = (error: unknown) =>
  error instanceof ScreenRequestCancelledError ||
  (error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'CanceledError' ||
      error.name === 'ScreenRequestCancelledError'));

/**
 * Connects a promise to a screen-owned AbortController.
 *
 * A normal native Promise is returned. An internal observer marks expected
 * route-cancellation rejections as handled for Hermes, while callers that
 * await/catch the returned promise still receive the cancellation error.
 */
function scopePromiseToController<T>(
  sourcePromise: Promise<T>,
  controller: AbortController,
  onSettled: () => void
): Promise<T> {
  let settled = false;
  let cleanedUp = false;
  let abortHandler: (() => void) | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (abortHandler) {
      controller.signal.removeEventListener('abort', abortHandler);
    }

    onSettled();
  };

  const scopedPromise = new Promise<T>((resolve, reject) => {
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    abortHandler = () => {
      rejectOnce(new ScreenRequestCancelledError());
    };

    controller.signal.addEventListener('abort', abortHandler, { once: true });

    void sourcePromise.then(resolveOnce, rejectOnce);

    if (controller.signal.aborted) {
      abortHandler();
    }
  });

  /*
   * Hermes reports a rejected promise as uncaught when a fire-and-forget call
   * has no rejection branch. This observer handles that exact native promise.
   * It does not replace or resolve it, so await/try-catch behavior is preserved.
   */
  void scopedPromise.catch(() => undefined);

  return scopedPromise;
}

const abortControllers = (controllers: Set<AbortController>) => {
  const activeControllers = Array.from(controllers);
  controllers.clear();

  activeControllers.forEach((controller) => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  });
};

/**
 * Runs an arbitrary asynchronous task with a screen-scoped AbortSignal.
 * Active work is cancelled when the route loses focus or unmounts.
 */
export function useCancelableRequest() {
  const controllersRef = useRef(new Set<AbortController>());

  const cancelAll = useCallback(() => {
    abortControllers(controllersRef.current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return cancelAll;
    }, [cancelAll])
  );

  useEffect(() => cancelAll, [cancelAll]);

  return useCallback(
    <T,>(task: (signal: AbortSignal) => Promise<T>) => {
      const controller = new AbortController();
      controllersRef.current.add(controller);

      const sourcePromise = Promise.resolve().then(() => task(controller.signal));

      return scopePromiseToController(sourcePromise, controller, () => {
        controllersRef.current.delete(controller);
      });
    },
    []
  );
}

/**
 * Creates a screen-scoped API proxy.
 *
 * Every function receives `{ signal }` as its final argument. API methods that
 * support cancellation can forward it to fetch/XHR; methods that ignore extra
 * arguments remain backward compatible.
 */
export function useCancelableApi<T extends object>(apiClient: T): T {
  const controllersRef = useRef(new Set<AbortController>());

  const cancelAll = useCallback(() => {
    abortControllers(controllersRef.current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return cancelAll;
    }, [cancelAll])
  );

  useEffect(() => cancelAll, [cancelAll]);

  return useMemo(
    () =>
      new Proxy(apiClient, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== 'function') return value;

          return (...args: unknown[]) => {
            const controller = new AbortController();
            controllersRef.current.add(controller);

            let result: unknown;

            try {
              result = value.apply(target, [
                ...args,
                {
                  signal: controller.signal,
                  __guardianScreenRequest: true,
                },
              ]);
            } catch (error) {
              controllersRef.current.delete(controller);
              throw error;
            }

            if (
              !result ||
              typeof (result as PromiseLike<unknown>).then !== 'function'
            ) {
              controllersRef.current.delete(controller);
              return result;
            }

            return scopePromiseToController(
              Promise.resolve(result as PromiseLike<unknown>),
              controller,
              () => {
                controllersRef.current.delete(controller);
              }
            );
          };
        },
      }),
    [apiClient]
  );
}
