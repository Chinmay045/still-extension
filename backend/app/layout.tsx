import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Still · Focus wallet',
  description: 'Top up the prepaid wallet behind your Still focus pledges.',
  icons: { icon: '/icon-32.png' }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
