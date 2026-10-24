import { DM_Sans, DM_Serif_Display } from 'next/font/google';
import './globals.css';

// Body font; the fallback stack lives in globals.css.
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

// Display font, used through Tailwind's font-display utility.
const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif-display',
  display: 'swap',
});

export const metadata = {
  title: 'Civic Radar',
  description: 'Follow local government meetings and documents for the towns and topics you care about.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
