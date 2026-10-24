import { redirect } from "next/navigation";

/** Visitors moved to their own module at /visitors; old links and bookmarks land there. */
export default function OldVisitorsPage() {
  redirect("/visitors");
}
