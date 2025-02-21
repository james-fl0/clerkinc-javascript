import React from 'react';

import type { RemixClerkProviderProps } from './types';

type ClerkRemixContextValue = Partial<Omit<RemixClerkProviderProps, 'children'>>;

const ClerkRemixOptionsCtx = React.createContext<{ value: ClerkRemixContextValue } | undefined>(undefined);
ClerkRemixOptionsCtx.displayName = 'ClerkRemixOptionsCtx';

const useClerkRemixOptions = () => {
  const ctx = React.useContext(ClerkRemixOptionsCtx)!;
  return ctx.value as ClerkRemixContextValue;
};

const ClerkRemixOptionsProvider = (props: React.PropsWithChildren<{ options: ClerkRemixContextValue }>) => {
  const { children, options } = props;
  return <ClerkRemixOptionsCtx.Provider value={{ value: options }}>{children}</ClerkRemixOptionsCtx.Provider>;
};

export { ClerkRemixOptionsProvider, useClerkRemixOptions };
