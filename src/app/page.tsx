import { redirect } from "next/navigation";
import { needsSetup, getAuthUser } from "@/lib/auth";

export default async function Home() {
  if (needsSetup()) {
    redirect("/setup");
  }

  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  redirect("/upload");
}
