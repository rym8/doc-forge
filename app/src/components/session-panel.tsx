"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { PlusIcon, Trash2Icon, SettingsIcon, ListIcon, LayoutTemplateIcon, ChevronDownIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { LlmCredentialsSettings } from "@/components/llm-credentials-sheet";
import { GoogleOAuthSettings } from "@/components/google-oauth-settings";
import { SESSION_TEMPLATES } from "@/lib/templates";
import type { SessionTemplate } from "@/lib/templates";

function buildQuickSessionTitle() {
  return `セッション ${new Date().toLocaleString()}`;
}

type PanelMode = "sessions" | "settings";
type SettingsTab = "llm" | "google";

interface SessionPanelProps {
  onSessionActivated?: () => void;
}

export function SessionPanel({ onSessionActivated }: SessionPanelProps) {
  const {
    sessions,
    currentSessionId,
    loadSessions,
    selectSession,
    createSession,
    updateSessionTitle,
    deleteSession,
    updateDocument,
  } = useStore();
  const [panelMode, setPanelMode] = useState<PanelMode>("sessions");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("llm");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isComposingTitle, setIsComposingTitle] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async () => {
    await createSession(buildQuickSessionTitle(), "document");
    onSessionActivated?.();
  };

  const handleCreateFromTemplate = async (template: SessionTemplate) => {
    setShowTemplates(false);
    await createSession(template.title, "document");
    await updateDocument(template.initialMarkdown);
    onSessionActivated?.();
  };

  const handleSelectSession = async (id: string) => {
    await selectSession(id);
    onSessionActivated?.();
  };

  const handleBeginEdit = (id: string, title: string) => {
    setEditingSessionId(id);
    setEditingTitle(title);
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle("");
    setIsComposingTitle(false);
  };

  const handleCommitEdit = async () => {
    if (!editingSessionId) return;
    await updateSessionTitle(editingSessionId, editingTitle);
    handleCancelEdit();
  };

  const handleDeleteSession = async (id: string, title: string) => {
    const confirmed = window.confirm(
      `セッション「${title}」を削除しますか？\nこの操作は取り消せません。`
    );
    if (!confirmed) return;
    await deleteSession(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-semibold">メニュー</h2>
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant={panelMode === "sessions" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setPanelMode("sessions")}
            aria-label="セッション管理を表示"
          >
            <ListIcon className="mr-1 h-3 w-3" />
            セッション
          </Button>
          <Button
            variant={panelMode === "settings" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setPanelMode("settings")}
            aria-label="設定を表示"
          >
            <SettingsIcon className="mr-1 h-3 w-3" />
            設定
          </Button>
        </div>
      </div>
      <Separator />

      {panelMode === "settings" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 border-b px-2 py-1.5">
            <Button
              variant={settingsTab === "llm" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSettingsTab("llm")}
            >
              LLMキー
            </Button>
            <Button
              variant={settingsTab === "google" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSettingsTab("google")}
            >
              Google Drive
            </Button>
          </div>
          {settingsTab === "llm" ? (
            <LlmCredentialsSettings className="min-h-0 flex-1" />
          ) : (
            <Suspense fallback={null}>
              <GoogleOAuthSettings className="min-h-0 flex-1" />
            </Suspense>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1 p-3 pb-2">
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => void handleCreateSession()}
                aria-label="新規セッション"
              >
                <PlusIcon className="mr-1 h-3 w-3" />
                新規
              </Button>
              <Button
                size="sm"
                variant={showTemplates ? "secondary" : "outline"}
                className="h-8 text-xs"
                onClick={() => setShowTemplates((prev) => !prev)}
                aria-label="テンプレートから開始"
                aria-expanded={showTemplates}
              >
                <LayoutTemplateIcon className="mr-1 h-3 w-3" />
                テンプレート
                <ChevronDownIcon
                  className={cn("ml-1 h-3 w-3 transition-transform", showTemplates && "rotate-180")}
                />
              </Button>
            </div>
            {showTemplates && (
              <div className="rounded-md border bg-muted/50 p-1">
                {SESSION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void handleCreateFromTemplate(template)}
                  >
                    <p className="text-xs font-medium">{template.title}</p>
                    <p className="text-[10px] text-muted-foreground">{template.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-1">
              {sessions.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  セッションはまだありません
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`セッションを選択: ${s.title}`}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    currentSessionId === s.id && "bg-accent"
                  )}
                  onClick={() => {
                    if (editingSessionId && editingSessionId !== s.id) {
                      handleCancelEdit();
                    }
                    if (editingSessionId === s.id) return;
                    if (currentSessionId === s.id) {
                      handleBeginEdit(s.id, s.title);
                      return;
                    }
                    void handleSelectSession(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (editingSessionId && editingSessionId !== s.id) {
                      handleCancelEdit();
                    }
                    if (editingSessionId === s.id) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (currentSessionId === s.id) {
                        handleBeginEdit(s.id, s.title);
                        return;
                      }
                      void handleSelectSession(s.id);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {editingSessionId === s.id ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onCompositionStart={() => setIsComposingTitle(true)}
                          onCompositionEnd={() => setIsComposingTitle(false)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const native = e.nativeEvent as KeyboardEvent;
                              if (
                                isComposingTitle ||
                                native.isComposing ||
                                native.keyCode === 229
                              ) {
                                return;
                              }
                              e.preventDefault();
                              void handleCommitEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelEdit();
                            }
                          }}
                          className="h-7 text-xs"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => void handleCommitEdit()}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px]"
                          onClick={handleCancelEdit}
                        >
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm leading-tight">{s.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                    aria-label={`セッションを削除: ${s.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteSession(s.id, s.title);
                    }}
                  >
                    <Trash2Icon className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
