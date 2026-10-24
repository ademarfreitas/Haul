import type { ReactNode } from "react";
import "./estilo.css";

export const metadata = { title: "Plist" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
        <link rel="icon" type="image/svg+xml" href="/plist-favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
