import type { Metadata } from 'next';
import { Space_Grotesk, Manrope, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import './orbital.css';
import { Providers } from './providers';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DAO Sentinel — Mission control for on-chain democracy',
  description:
    'DAO Sentinel tracks voter turnout, power concentration, and whale activity across the DAO universe — so governance capture never slips by unseen.',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(!window.matchMedia||!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('anim-ready');}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen text-foreground antialiased">
        <div className="bg-atmosphere" />
        <div className="bg-grid" />
        <div className="bg-noise" />
        <div className="shell">
          <Providers>{children}</Providers>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
