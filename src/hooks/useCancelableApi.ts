import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

export class ScreenRequestCancelledError extends Error {
  constructor() {
    super('The request was cancelled because the screen is no longer active.');
    this.name = 'ScreenRequestCancelledError';
  }
}

export const isScreenRequestCancelled = (error: unknown) =>
  error instanceof ScreenRequestCancelledError ||
  (error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'CanceledError' ||
      error.name === 'ScreenRequestCancelledError'));

/**
 * Native promises only mark the exact promise branch as observed.
 *
 * A screen can correctly ignore its request promise with `void`, or attach a
 * fulfillment-only `.then(...)`. When navigation cancels that request, the
 * derived promise branch can otherwise be reported by Hermes as an uncaught
 * rejection even though cancellation is expected.
 *
 * This small Promise-compatible wrapper observes every derived branch. It
 * keeps cancellation rejectable for callers that use await/try-catch, while
 * preventing expected route cleanup from opening the red error overlay.
 */
class ScreenObservedPromise<T> implements Promise<T> {
  readonly [Symbol.toStringTag] = 'Promise';

  private hasConsumer = false;

  constructor(private readonly source: Promise<T>) {
    /*
     * Observe this exact branch. The original promise remains rejected, so
     * await/catch callers still receive the real error. This observer only
     * prevents ignored cancellation branches from being treated as uncaught.
     */
    void source.then(
      () => undefined,
      (error) => {
        if (isScreenRequestCancelled(error)) return undefined;

        /*
         * Do not hide genuine ignored errors. Wait one task so await/then/catch
         * has time to register as a consumer, then report only truly abandoned
         * non-cancellation failures.
         */
        setTimeout(() => {
          if (!this.hasConsumer) {
            console.error('Unhandled screen request error:', error);
          }
        }, 0);

        return undefined;
      }
    );
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    this.hasConsumer = true;

    return new ScreenObservedPromise(
      this.source.then(onfulfilled, onrejected)
    );
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null
  ): Promise<T | TResult> {
    this.hasConsumer = true;

    return new ScreenObservedPromise(this.source.catch(onrejected));
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    this.hasConsumer = true;

    return new ScreenObservedPromise(this.source.finally(onfinally));
  }
}

/**
 * Connects a promise to a screen-owned AbortController.
 *
 * Route cleanup rejects with ScreenRequestCancelledError so existing
 * try/catch blocks can stop their work. ScreenObservedPromise keeps ignored
 * and fulfillment-only promise branches quiet when that expected cancellation
 * occurs.
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
    sourcePromise.then(resolveOnce, rejectOnce);

    if (controller.signal.aborted) {
      abortHandler();
    }
  });

  return new ScreenObservedPromise(scopedPromise);
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

      // Convert synchronous task throws into the same observed promise chain.
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
 * support cancellation can forward it to fetch/XHR/Axios; methods that ignore
 * extra arguments remain backward compatible.
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
    [apiClient, cancelAll]
  );
}