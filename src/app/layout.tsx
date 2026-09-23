import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qala Balance AI — Аким на 5 часов",
  description: "Симулятор управленческих решений для городской среды.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
