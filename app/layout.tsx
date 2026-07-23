import type { Metadata } from "next";
import { Cinzel, IM_Fell_English } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
});

const imFell = IM_Fell_English({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-im-fell",
});

export const metadata: Metadata = {
  title: "DJINN-E-QAFAS | جن قفس",
  description: "A Pakistani Horror Visual Novel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${cinzel.variable} ${imFell.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
