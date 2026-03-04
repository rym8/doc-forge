"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type LlmProvider = "gemini" | "openai" | "anthropic";

interface LlmCredentialStatus {
  provider: LlmProvider;
  configured: boolean;
  source: "stored" | "env" | "none";
  maskedKey: string | null;
}

interface CredentialsResponse {
  providers: LlmCredentialStatus[];
}

const PROVIDER_ORDER: LlmProvider[] = ["gemini", "openai", "anthropic"];

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};

function normalizeProviders(providers: LlmCredentialStatus[]): LlmCredentialStatus[] {
  const map = new Map(providers.map((p) => [p.provider, p]));
  return PROVIDER_ORDER.map(
    (provider) =>
      map.get(provider) ?? {
        provider,
        configured: false,
        source: "none",
        maskedKey: null,
      }
  );
}

interface LlmCredentialsSettingsProps {
  className?: string;
}

export function LlmCredentialsSettings({
  className,
}: LlmCredentialsSettingsProps) {
  const [providers, setProviders] = useState<LlmCredentialStatus[]>([]);
  const [inputValues, setInputValues] = useState<Record<LlmProvider, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [loading, setLoading] = useState(false);
  const [busyProvider, setBusyProvider] = useState<LlmProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const orderedProviders = useMemo(
    () => normalizeProviders(providers),
    [providers]
  );
  const configuredProviders = useMemo(
    () => orderedProviders.filter((p) => p.configured),
    [orderedProviders]
  );

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/settings/llm-credentials");
      if (!res.ok) {
        throw new Error(`キー設定の取得に失敗しました (${res.status})`);
      }
      const body = (await res.json()) as CredentialsResponse;
      setProviders(normalizeProviders(body.providers ?? []));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "キー設定の取得に失敗しました";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const handleSave = useCallback(
    async (provider: LlmProvider) => {
      const apiKey = inputValues[provider].trim();
      if (!apiKey) return;

      setBusyProvider(provider);
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        const res = await fetch("/api/settings/llm-credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        });
        const body = (await res.json()) as CredentialsResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? `キーの保存に失敗しました (${res.status})`);
        }

        setProviders(normalizeProviders(body.providers ?? []));
        setInputValues((prev) => ({ ...prev, [provider]: "" }));
        setSuccessMessage(`${PROVIDER_LABELS[provider]} のキーを保存しました。`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "キーの保存に失敗しました";
        setErrorMessage(message);
      } finally {
        setBusyProvider(null);
      }
    },
    [inputValues]
  );

  const handleClearStored = useCallback(async (provider: LlmProvider) => {
    setBusyProvider(provider);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/settings/llm-credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = (await res.json()) as CredentialsResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `保存キーの削除に失敗しました (${res.status})`);
      }

      setProviders(normalizeProviders(body.providers ?? []));
      setSuccessMessage(
        `${PROVIDER_LABELS[provider]} の保存キーを削除しました。環境変数があればそちらを使用します。`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存キーの削除に失敗しました";
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="space-y-1 p-3">
        <h3 className="text-sm font-semibold">LLMキー設定</h3>
        <p className="text-xs text-muted-foreground">
          設定済み: {configuredProviders.length}/3
          {configuredProviders.length > 0
            ? `（${configuredProviders.map((p) => PROVIDER_LABELS[p.provider]).join(" / ")}）`
            : "（未設定）"}
        </p>
      </div>
      <Separator />
      <div className="flex-1 overflow-auto p-3">
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              設定状況を読み込み中...
            </div>
          )}

          {orderedProviders.map((status) => {
            const busy = busyProvider === status.provider;
            return (
              <div key={status.provider} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {PROVIDER_LABELS[status.provider]}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      status.source === "stored"
                        ? "bg-emerald-100 text-emerald-700"
                        : status.source === "env"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {status.source === "stored"
                      ? "保存キーを使用中"
                      : status.source === "env"
                        ? "環境変数キーを使用中"
                        : "未設定"}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Input
                    type="password"
                    value={inputValues[status.provider]}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [status.provider]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void handleSave(status.provider);
                    }}
                    placeholder={`${PROVIDER_LABELS[status.provider]} の新しいキーを入力`}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={busy || !inputValues[status.provider].trim()}
                    onClick={() => void handleSave(status.provider)}
                  >
                    {busy ? "保存中..." : "保存"}
                  </Button>
                </div>

                {status.source === "stored" && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      disabled={busy}
                      onClick={() => void handleClearStored(status.provider)}
                    >
                      保存キーを削除
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          補足: この画面で保存したキーは環境変数より優先して利用されます。
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {successMessage}
          </p>
        )}
      </div>
    </div>
  );
}
