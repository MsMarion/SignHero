import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Monoton, Anta } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { BackgroundMusic } from "./_components/BackgroundMusic";

export const metadata: Metadata = {
  title: { default: "SignHero", template: "%s | SignHero" },
  description:
    "Learn ASL fingerspelling by playing. Rhythm and reflex games that recognise your hand signs through your webcam.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const monoton = Monoton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-monoton",
});

const anta = Anta({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anta",
});

import { UnifiedBackground } from "./_components/UnifiedBackground";
import { TopHUD } from "./_components/TopHUD";
import { Navbar } from "./_components/navbar";
import { MenuContainerWrapper } from "./_components/MenuContainerWrapper";

import { ScaledContainer } from "~/components/ScaledContainer";
import { AuthProvider } from "./_components/auth-provider";
import { HeroNameGate } from "./_components/HeroNameGate";
import { ClientErrorReporter } from "./_components/ClientErrorReporter";
import { DebugPanel } from "./_components/DebugPanel";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${monoton.variable} ${anta.variable}`}>
      <body className="font-[family-name:var(--font-anta)] bg-black w-screen h-screen overflow-hidden flex items-center justify-center">
        <ScaledContainer>
          <UnifiedBackground />
          <AuthProvider>
            <HeroNameGate />
            <ClientErrorReporter />
            <DebugPanel />
            <BackgroundMusic />
            <TopHUD />
            <Navbar />
            <MenuContainerWrapper>
              <TRPCReactProvider>{children}</TRPCReactProvider>
            </MenuContainerWrapper>
          </AuthProvider>
        </ScaledContainer>
      </body>
    </html>
  );
}
