import type { Metadata } from "next";

export const metadata: Metadata = { title: "Whack-A-Sign" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
