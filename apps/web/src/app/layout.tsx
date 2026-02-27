import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { ApiWarningListener } from '@/components/layout/api-warning-listener';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Private LLM',
  description: 'Your private AI productivity suite — chat, documents, spreadsheets, and more.',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
        <ApiWarningListener />
      </body>
    </html>
  );
}
