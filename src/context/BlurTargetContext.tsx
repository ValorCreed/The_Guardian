import React, { createContext, useContext } from 'react';
import { View } from 'react-native';

type BlurTargetContextValue = {
  targetRef: React.RefObject<View | null>;
};

const BlurTargetContext = createContext<BlurTargetContextValue | null>(null);

export function BlurTargetProvider({
  targetRef,
  children,
}: {
  targetRef: React.RefObject<View | null>;
  children: React.ReactNode;
}) {
  return (
    <BlurTargetContext.Provider value={{ targetRef }}>
      {children}
    </BlurTargetContext.Provider>
  );
}

export function useBlurTarget() {
  return useContext(BlurTargetContext);
}