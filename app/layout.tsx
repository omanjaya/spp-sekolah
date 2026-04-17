import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { RootProviders } from '@/providers/root-providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sistem Pembayaran SPP',
    template: '%s | SMAN 1 Denpasar',
  },
  description: 'Sistem manajemen pembayaran SPP dan Komite SMAN 1 Denpasar',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <RootProviders>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </RootProviders>
      </body>
    </html>
  );
}
