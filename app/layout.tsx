import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jb-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dynrinth',
  description: 'Easy search and download Minecraft mods from Modrinth & CurseForge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
