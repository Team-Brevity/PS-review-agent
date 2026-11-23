import type {Metadata} from 'next';
import {Plus_Jakarta_Sans, IBM_Plex_Mono} from 'next/font/google';
import './globals.css'; // Global styles

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'PS Review Agent',
  description:
    'ProWorkflow webhook and Gemini advisory review backend for engineering Producer Statements (PS1, PS2, PS4).',
  openGraph: {
    title: 'PS Review Agent',
    description:
      'ProWorkflow webhook and Gemini advisory review backend for engineering Producer Statements (PS1, PS2, PS4).',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PS Review Agent',
    description:
      'ProWorkflow webhook and Gemini advisory review backend for engineering Producer Statements (PS1, PS2, PS4).',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body
        suppressHydrationWarning
        className="font-sans bg-slate-50 text-slate-900 antialiased selection:bg-slate-900 selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
