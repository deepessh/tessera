import "./globals.css";

export const metadata = {
  title: "Patient Advocate",
  description: "Your AI advocate fights denied claims — live.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
