import Link from "next/link";
import { SignupForm } from "./form";
import { timeZones } from "@/lib/tz";

export const metadata = { title: "Create workspace" };

export default function SignupPage() {
  const zones = timeZones();
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-6 text-lg font-semibold text-brand-700 lg:hidden">comarketing</p>
        <h1 className="text-2xl font-semibold tracking-tight">Create your company workspace</h1>
        <p className="mt-1 text-sm text-muted">
          You will be the workspace admin. Already have an account? <Link href="/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </div>
      <SignupForm zones={zones} />
    </div>
  );
}
