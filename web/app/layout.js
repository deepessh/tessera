export const metadata = {
  title: "WS Connectivity Spike",
  description: "Phase 2.0a — https Vercel page to ws://127.0.0.1 loopback",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
