import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lab 1 live quiz",
  description: "A fast, live practice quiz for the Network Programming Lab 1 class.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
