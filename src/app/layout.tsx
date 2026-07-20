import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/presentation/providers/auth-provider";
import { ThemeProvider } from "@/presentation/providers/theme-provider";

export const metadata: Metadata = {
  title: { default: "3Star Business Suite", template: "%s | 3Star Business Suite" },
  description: "Projects, invoices, payments, reports, and Excel exports in one secure workflow.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const themeInitScript = `(function () {
  try {
    var stored = window.localStorage.getItem("3star-theme");
    var theme = stored === "dark" || stored === "light" || stored === "professional"
      ? stored
      : "professional";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "professional");
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="professional" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
