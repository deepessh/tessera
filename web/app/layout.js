import "./globals.css";

export const metadata = {
  title: "Tessera",
  description: "Patient-side voice advocacy — an agent on your side of the call.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
