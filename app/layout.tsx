import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "comarketing", template: "%s · comarketing" },
  description: "Plan, generate, approve and schedule your company's social media posts in one place.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7c3aed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
