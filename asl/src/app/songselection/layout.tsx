import type { Metadata } from "next";

export const metadata: Metadata = { title: "Choose a Song" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
