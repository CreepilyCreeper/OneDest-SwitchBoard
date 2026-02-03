import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OneDest SwitchBoard',
  description: 'Rail network visualization and maintenance tool for CivMC OneDest rail system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
