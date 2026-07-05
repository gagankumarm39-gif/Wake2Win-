"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import { Check, MessageSquare, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

const ROW_HEIGHT = 72;

function Row({
  conversation,
  active,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);

  function commitRename() {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== conversation.title) onRename(title);
    else setDraft(conversation.title);
  }

  return (
    <div
      className={cn(
        "group flex h-full items-center gap-2 rounded-xl border px-3 transition-colors",
        active
          ? "border-brand-400 bg-brand-500/10"
          : "border-transparent hover:border-slate-300 hover:bg-slate-500/5 dark:hover:border-slate-700"
      )}
    >
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            className="w-full rounded-lg border border-brand-400 bg-transparent px-2 py-1 text-sm outline-none"
            maxLength={80}
          />
          <button type="submit" aria-label="Save title" className="text-brand-500">
            <Check className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <>
          <button onClick={onSelect} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 text-left">
            <span className="flex w-full items-center gap-1.5">
              {conversation.pinned && <Pin className="h-3 w-3 shrink-0 text-brand-500" />}
              <span className="truncate text-sm font-semibold">{conversation.title}</span>
            </span>
            <span className="text-xs text-slate-500">
              {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={onTogglePin}
              aria-label={conversation.pinned ? "Unpin" : "Pin"}
              className="rounded-lg p-1.5 text-slate-500 hover:text-brand-500"
            >
              {conversation.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setEditing(true)}
              aria-label="Rename"
              className="rounded-lg p-1.5 text-slate-500 hover:text-brand-500"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete"
              className="rounded-lg p-1.5 text-slate-500 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ChatHistory({
  open,
  activeId,
  onClose,
  onSelect,
  onNew,
  onDeleted,
}: {
  open: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!cancelled) {
          setConversations((data as Conversation[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
    return [...list].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)
    );
  }, [conversations, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  function patch(id: string, changes: Partial<Conversation>) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }

  function togglePin(c: Conversation) {
    patch(c.id, { pinned: !c.pinned });
    void supabase.from("conversations").update({ pinned: !c.pinned }).eq("id", c.id);
  }

  function rename(c: Conversation, title: string) {
    patch(c.id, { title });
    void supabase.from("conversations").update({ title }).eq("id", c.id);
  }

  function remove(c: Conversation) {
    if (!window.confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    setConversations((prev) => prev.filter((x) => x.id !== c.id));
    void supabase.from("conversations").delete().eq("id", c.id);
    onDeleted(c.id);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.aside
            initial={{ x: 340 }}
            animate={{ x: 0 }}
            exit={{ x: 340 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="glass absolute right-0 top-0 flex h-full w-[21rem] max-w-[90vw] flex-col rounded-none rounded-l-3xl p-4"
          >
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-lg font-bold">Chat history</h2>
              <button onClick={onClose} aria-label="Close history" className="rounded-lg p-1.5 text-slate-500 hover:text-brand-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              onClick={onNew}
              className="mb-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-400 px-3 py-2.5 text-sm font-semibold text-brand-500 transition-colors hover:bg-brand-500/10"
            >
              <Plus className="h-4 w-4" /> New chat
            </button>

            <Input
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-3"
            />

            <div ref={parentRef} className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
                  <MessageSquare className="h-6 w-6" />
                  <p className="text-sm">{query ? "No matches" : "No conversations yet"}</p>
                </div>
              ) : (
                <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                  {virtualizer.getVirtualItems().map((row) => {
                    const c = filtered[row.index];
                    return (
                      <div
                        key={c.id}
                        className="absolute left-0 top-0 w-full py-0.5"
                        style={{ height: row.size, transform: `translateY(${row.start}px)` }}
                      >
                        <Row
                          conversation={c}
                          active={c.id === activeId}
                          onSelect={() => onSelect(c)}
                          onTogglePin={() => togglePin(c)}
                          onRename={(title) => rename(c, title)}
                          onDelete={() => remove(c)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
