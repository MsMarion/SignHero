import { redirect } from "next/navigation";

// This used to be a second copy of the Whack-A-Sign page without the full-screen layout. One game, one URL.
export default function TrainingIndexPage() {
  redirect("/whack");
}
