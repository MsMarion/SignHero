import { notFound } from "next/navigation";
import { devmodeEnabled } from "~/server/devmode-guard";

// Internal demo page: only available in development (or with ENABLE_DEVMODE=1).
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!devmodeEnabled()) notFound();
  return <>{children}</>;
}
