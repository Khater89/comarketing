import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-6 text-lg font-semibold text-brand-700 lg:hidden">comarketing</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="mt-1 text-sm text-muted">
          New company? <Link href="/signup" className="font-medium text-brand-700 underline-offset-4 hover:underline">Create a workspace</Link>
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
