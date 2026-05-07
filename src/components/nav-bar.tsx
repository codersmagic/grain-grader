"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function NavBar() {
  const router = useRouter();

  async function handleLogout() {
    document.cookie = "auth-token=; path=/; max-age=0";
    router.push("/login");
  }

  return (
    <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          href="/upload"
          className="text-lg font-semibold tracking-tight text-zinc-100"
        >
          Grain Grader
        </Link>
        <Link
          href="/sessions"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Sessions
        </Link>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        Logout
      </Button>
    </nav>
  );
}
