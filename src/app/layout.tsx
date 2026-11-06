import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, Instrument_Sans } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "SageMate",
  description: "Generate and grade your own revision questions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${bricolage.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col md:flex-row" suppressHydrationWarning>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
