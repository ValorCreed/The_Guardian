import React, { createContext, useContext, useMemo, useRef } from 'react';

export type FloatingHeaderActionTone = 'default' | 'primary' | 'danger';

export type FloatingHeaderAction = {
  key: string;
  icon: string;
  onPress: () => void;
  tone?: FloatingHeaderActionTone;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
};

export type FloatingHeaderActionsConfig = {
  visible: boolean;
  actions: FloatingHeaderAction[];
};

export type FloatingHeaderActionsRegistration = FloatingHeaderActionsConfig & {
  ownerId: string;
};

type RegistrationListener = (
  registration: FloatingHeaderActionsRegistration | null
) => void;

type FloatingHeaderActionsRegistry = {
  publish: (ownerId: string, config: FloatingHeaderActionsConfig) => void;
  clear: (ownerId: string) => void;
  subscribe: (listener: RegistrationListener) => () => void;
  getCurrent: () => FloatingHeaderActionsRegistration | null;
};

const FloatingHeaderActionsContext =
  createContext<FloatingHeaderActionsRegistry | null>(null);

export function FloatingHeaderActionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentRef = useRef<FloatingHeaderActionsRegistration | null>(null);
  const listenersRef = useRef(new Set<RegistrationListener>());

  const registry = useMemo<FloatingHeaderActionsRegistry>(() => {
    const emit = (registration: FloatingHeaderActionsRegistration | null) => {
      listenersRef.current.forEach((listener) => listener(registration));
    };

    return {
      publish(ownerId, config) {
        const next: FloatingHeaderActionsRegistration = {
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
    <FloatingHeaderActionsContext.Provider value={registry}>
      {children}
    </FloatingHeaderActionsContext.Provider>
  );
}

export function useFloatingHeaderActionsRegistry() {
  const registry = useContext(FloatingHeaderActionsContext);

  if (!registry) {
    throw new Error(
      'FloatingHeaderActions must be used inside FloatingHeaderActionsProvider.'
    );
  }

  return registry;
}
