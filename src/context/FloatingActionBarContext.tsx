import React, { createContext, useContext, useMemo, useRef } from 'react';

export type FloatingActionBarTone = 'default' | 'primary' | 'danger';

export type FloatingActionBarAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  tone?: FloatingActionBarTone;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

export type FloatingActionBarConfig = {
  visible: boolean;
  actions: FloatingActionBarAction[];
  onDismiss?: () => void;
  bottomOffset?: number;
};

export type FloatingActionBarRegistration = FloatingActionBarConfig & {
  ownerId: string;
};

type RegistrationListener = (
  registration: FloatingActionBarRegistration | null
) => void;

type FloatingActionBarRegistry = {
  publish: (ownerId: string, config: FloatingActionBarConfig) => void;
  clear: (ownerId: string) => void;
  subscribe: (listener: RegistrationListener) => () => void;
  getCurrent: () => FloatingActionBarRegistration | null;
};

const FloatingActionBarContext = createContext<FloatingActionBarRegistry | null>(null);

export function FloatingActionBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentRef = useRef<FloatingActionBarRegistration | null>(null);
  const listenersRef = useRef(new Set<RegistrationListener>());

  const registry = useMemo<FloatingActionBarRegistry>(() => {
    const emit = (registration: FloatingActionBarRegistration | null) => {
      listenersRef.current.forEach((listener) => listener(registration));
    };

    return {
      publish(ownerId, config) {
        const next: FloatingActionBarRegistration = {
          ownerId,
          ...config,
        };

        currentRef.current = next;
        emit(next);
      },

      clear(ownerId) {
        if (currentRef.current?.ownerId !== ownerId) return;
        currentRef.current = null;
        emit(null);
      },

      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(currentRef.current);

        return () => {
          listenersRef.current.delete(listener);
        };
      },

      getCurrent() {
        return currentRef.current;
      },
    };
  }, []);

  return (
    <FloatingActionBarContext.Provider value={registry}>
      {children}
    </FloatingActionBarContext.Provider>
  );
}

export function useFloatingActionBarRegistry() {
  const registry = useContext(FloatingActionBarContext);

  if (!registry) {
    throw new Error(
      'FloatingActionBar must be used inside FloatingActionBarProvider.'
    );
  }

  return registry;
}
