'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider basePath="/api/v1/auth">{children}</SessionProvider>;
}
