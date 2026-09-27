"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/auth/browser";
import { sendEvent } from "@/lib/client/events";

const RESEND_COOLDOWN_SEC = 60;

function otpErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "送信回数の上限に達しました。しばらく待ってから再度お試しください。";
  }
  if (error.code === "otp_expired") return "コードの有効期限が切れています。コードを再送してください。";
  if (error.code === "email_address_invalid" || error.code === "validation_failed") return "メールアドレスを確認してください。";
  return "認証できませんでした。コードを確認して再度お試しください。";
}

export function LoginForm() {
  const { config, signedIn, signInDemo, refreshAuth, pendingSaveAfterLogin } = useAppState();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const afterLogin = () => router.push(pendingSaveAfterLogin ? "/search" : "/wishes");

  const purpose = (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p>ログインすると、確認した購入条件を保存し、後から同じ条件で探し直せます。</p>
      <p>メールアドレスはログインのためだけに使い、検索語やAIへの入力には使いません。入力中の条件はこのタブに残ります。</p>
    </div>
  );

  if (config.mode === "demo") {
    return (
      <div className="flex flex-col gap-4">
        {purpose}
        <Alert variant="warning">
          デモモードでは実際の認証を行いません。「デモとして続ける」を押すと、このタブのメモリ上だけで保存を体験できます（再読み込みで消えます）。
        </Alert>
        {signedIn ? (
          <Button onClick={afterLogin}>続ける</Button>
        ) : (
          <Button
            onClick={() => {
              signInDemo();
              afterLogin();
            }}
          >
            デモとして続ける
          </Button>
        )}
      </div>
    );
  }

  const supabase = getBrowserSupabase();
  if (!config.authEnabled || !supabase) {
    return (
      <div className="flex flex-col gap-4">
        {purpose}
        <Alert variant="warning">ログイン機能は現在設定されていません。管理者はSupabaseの設定を確認してください。</Alert>
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="flex flex-col gap-4">
        <p>ログイン済みです。</p>
        <Button onClick={afterLogin}>{pendingSaveAfterLogin ? "検索画面に戻って保存する" : "マイ希望へ"}</Button>
      </div>
    );
  }

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      setError(otpErrorMessage(err));
      return;
    }
    setStep("code");
    setCooldown(RESEND_COOLDOWN_SEC);
    setInfo("確認コードをメールで送信しました。届いたコードを入力してください。");
  };

  return (
    <div className="flex flex-col gap-4">
      {purpose}
      {step === "email" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-email">メールアドレス</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !email.trim()}>
            確認コードを送信
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
            setBusy(false);
            if (err) {
              setError(otpErrorMessage(err));
              return;
            }
            await refreshAuth();
            sendEvent("login_completed");
            afterLogin();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-code">確認コード</Label>
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-xs text-muted-foreground">{email} に送信しました。</p>
          </div>
          <Button type="submit" disabled={busy || code.length < 6}>
            ログイン
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
              {cooldown > 0 ? `コードを再送（${cooldown}秒後）` : "コードを再送"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep("email");
                setCode("");
                setInfo(null);
              }}
            >
              メールアドレスを変更
            </Button>
          </div>
        </form>
      )}
      <div aria-live="polite">
        {info && <Alert variant="info">{info}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </div>
  );
}
