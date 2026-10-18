import { notFound } from "next/navigation";
import { devmodeEnabled } from "~/server/devmode-guard";

// The song import tools are off in production (see server/devmode-guard.ts).
export default function DevModeLayout({ children }: { children: React.ReactNode }) {
  if (!devmodeEnabled()) notFound();
  return <>{children}</>;
}
