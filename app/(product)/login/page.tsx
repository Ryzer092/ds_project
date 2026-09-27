import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <LoginForm />
    </div>
  );
}
