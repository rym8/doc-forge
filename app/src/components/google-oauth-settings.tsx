"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

interface GoogleOAuthStatus {
  clientConfigured: boolean;
  clientId: string | null;
  connected: boolean;
}

interface GoogleOAuthSettingsProps {
  className?: string;
}

export function GoogleOAuthSettings({ className }: GoogleOAuthSettingsProps) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleOAuthStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google-auth/status");
      if (res.ok) {
        setStatus((await res.json()) as GoogleOAuthStatus);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Detect OAuth callback result from URL params
  useEffect(() => {
    const connected = searchParams.get("google_connected");
    const authError = searchParams.get("google_auth_error");
    if (connected === "1") {
      setMessage({ type: "success", text: "Google Drive に接続しました。" });
      void loadStatus();
    } else if (authError) {
      setMessage({ type: "error", text: `Google 認証エラー: ${authError}` });
    }
  }, [searchParams, loadStatus]);

  const handleSaveCredentials = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/google-oauth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `保存に失敗しました (${res.status})`);
      }
      setStatus((await res.json()) as GoogleOAuthStatus);
      setClientId("");
      setClientSecret("");
      setMessage({ type: "success", text: "OAuth クライアント情報を保存しました。" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  }, [clientId, clientSecret]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/google-auth/authorize");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "認証 URL の取得に失敗しました");
      }
      const data = (await res.json()) as { authUrl: string };
      // Same-window redirect; Google redirects back to /api/google-auth/callback
      window.location.href = data.authUrl;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "接続に失敗しました",
      });
      setConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/google-auth/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`切断に失敗しました (${res.status})`);
      setStatus((await res.json()) as GoogleOAuthStatus);
      setMessage({ type: "success", text: "Google Drive との接続を解除しました。" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "切断に失敗しました" });
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await fetch("/api/settings/google-oauth", { method: "DELETE" });
      setStatus({ clientConfigured: false, clientId: null, connected: false });
      setMessage({ type: "success", text: "Google 設定をすべて削除しました。" });
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="space-y-1 p-3">
        <h3 className="text-sm font-semibold">Google Drive 連携</h3>
        <p className="text-xs text-muted-foreground">
          スライドを Google Slides として Drive に直接アップロードします。
        </p>
      </div>
      <Separator />
      <div className="flex-1 overflow-auto p-3 space-y-4">

        {/* Connection Status */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">接続状態</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                status?.connected
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {status?.connected ? "接続済み" : "未接続"}
            </span>
          </div>
          {status?.clientConfigured && !status.connected && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              {connecting ? "リダイレクト中..." : "Google アカウントに接続"}
            </Button>
          )}
          {status?.connected && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? "切断中..." : "接続を解除"}
            </Button>
          )}
        </div>

        {/* Client Credentials */}
        <div className="rounded-md border p-3 space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">OAuth クライアント設定</p>
            <p className="text-[11px] text-muted-foreground leading-4">
              Google Cloud Console でプロジェクトを作成し、「OAuth 2.0 クライアント ID」を発行してください。
              リダイレクト URI に <code className="bg-muted px-1 rounded">http://localhost:3000/api/google-auth/callback</code>（または実際のポート番号）を登録してください。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Client ID {status?.clientId && <span className="text-emerald-600">（設定済み: {status.clientId.slice(0, 20)}...）</span>}
            </label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Client Secret
            </label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-..."
              className="h-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              onClick={() => void handleSaveCredentials()}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            {(status?.clientConfigured || status?.connected) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => void handleClearAll()}
              >
                全削除
              </Button>
            )}
          </div>
        </div>

        {message && (
          <p
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              message.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-300 bg-red-50 text-red-700"
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
