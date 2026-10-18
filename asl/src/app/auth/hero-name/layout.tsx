import type { Metadata } from "next";

export const metadata: Metadata = { title: "Choose Your Hero Name" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
