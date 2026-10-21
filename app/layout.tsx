import './globals.css';

export const metadata = {
  title: 'Civic Radar',
  description: 'Follow local government meetings and documents for the towns and topics you care about.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
