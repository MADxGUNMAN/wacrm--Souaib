"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Rnd } from "react-rnd";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useFloatingChats, type FloatingChatState } from "./floating-chats-context";
import { MessageThread } from "./message-thread";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import type { Message, ConversationStatus } from "@/types";

export function FloatingChatWindow({
  chat,
  defaultIndex,
}: {
  chat: FloatingChatState;
  defaultIndex: number;
}) {
  const { closeChat, minimizeChat, maximizeChat, restoreChat } = useFloatingChats();
  const [messages, setMessages] = useState<Message[]>([]);
  const [resyncToken, setResyncToken] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", chat.conversation.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data as Message[]);
    }
    setLoading(false);
  }, [chat.conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages, resyncToken]);

  // Handle realtime events
  const handleMessageEvent = useCallback(
    (event: any) => {
      const newMsg = event.new as Message;
      if (newMsg.conversation_id !== chat.conversation.id) return;

      if (event.eventType === "INSERT") {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          const withoutOptimistic = prev.filter((m) => !m.id.startsWith("temp-"));
          return [...withoutOptimistic, newMsg];
        });
      } else if (event.eventType === "UPDATE") {
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [chat.conversation.id]
  );

  const { isConnected } = useRealtime({
    channelName: `floating-chat-${chat.conversation.id}`,
    onMessageEvent: handleMessageEvent,
    enabled: true,
  });

  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current && messages.length > 0) {
      setResyncToken((n) => n + 1);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, messages.length]);

  const handleRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  // Mark messages as read automatically when the window is open (not minimized).
  // This effect runs on mount (after fetch), when new messages arrive, and when maximized.
  useEffect(() => {
    if (!chat.isMinimized && messages.length > 0) {
      const supabase = createClient();
      supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", chat.conversation.id)
        .then(({ error }) => {
          if (error) console.error("Failed to reset floating window unread count:", error);
        });
    }
  }, [messages.length, chat.isMinimized, chat.conversation.id]);

  if (chat.isMinimized) {
    return (
      <div
        className="fixed bottom-0 z-50 flex h-12 w-64 cursor-pointer items-center justify-between rounded-t-lg border-x border-t border-border bg-card px-4 shadow-xl transition-colors hover:bg-accent"
        style={{ right: `${defaultIndex * 260 + 20}px` }}
        onClick={() => restoreChat(chat.conversation.id)}
      >
        <span className="truncate font-medium text-foreground">
          {chat.contact?.name || chat.contact?.phone || "Customer"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeChat(chat.conversation.id);
            }}
            className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Rnd
      default={{
        x: window.innerWidth - 450 - defaultIndex * 40,
        y: window.innerHeight - 650 - defaultIndex * 40,
        width: 400,
        height: 600,
      }}
      minWidth={300}
      minHeight={400}
      bounds="window"
      dragHandleClassName="drag-handle"
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      size={chat.isMaximized ? { width: "100%", height: "100%" } : undefined}
      position={chat.isMaximized ? { x: 0, y: 0 } : undefined}
      disableDragging={chat.isMaximized}
      enableResizing={!chat.isMaximized}
    >

      {/* Embedded Message Thread */}
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <MessageThread
            conversation={chat.conversation}
            contact={chat.contact}
            messages={messages}
            onMessagesLoaded={setMessages}
            onNewMessage={(msg) => setMessages((prev) => [...prev, msg])}
            onUpdateMessage={(id, updates) =>
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
              )
            }
            onStatusChange={() => {}}
            onAssignChange={() => {}}
            resyncToken={resyncToken}
            onRefresh={handleRefresh}
            contactPanelOpen={false}
            isFloating={true}
            headerActions={
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeChat(chat.conversation.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    chat.isMaximized
                      ? restoreChat(chat.conversation.id)
                      : maximizeChat(chat.conversation.id)
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {chat.isMaximized ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => closeChat(chat.conversation.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            }
          />
        )}
      </div>
    </Rnd>
  );
}
