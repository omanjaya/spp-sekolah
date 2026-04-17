'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';
import { AuthSessionProvider } from './session-provider';

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <AuthSessionProvider>
      <ThemeProvider>
        <QueryProvider>{children}</QueryProvider>
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
