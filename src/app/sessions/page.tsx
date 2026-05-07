import { redirect } from "next/navigation";
import { needsSetup, getAuthUser } from "@/lib/auth";
import { NavBar } from "@/components/nav-bar";

export default async function SessionsPage() {
  if (needsSetup()) {
    redirect("/setup");
  }

  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-400">Sessions page coming soon.</p>
      </main>
    </div>
  );
}
