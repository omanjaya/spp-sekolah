'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';

type Props = ComponentProps<typeof NextThemesProvider> & { children: ReactNode };

export function ThemeProvider({ children, ...rest }: Props) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem {...rest}>
      {children}
    </NextThemesProvider>
  );
}
