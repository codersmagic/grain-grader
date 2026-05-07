import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import SetupForm from "./setup-form";

export default function SetupPage() {
  if (!needsSetup()) {
    redirect("/login");
  }

  return <SetupForm />;
}
