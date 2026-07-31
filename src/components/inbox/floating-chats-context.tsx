"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { Conversation, Contact } from "@/types";

const STORAGE_KEY = "wacrm-floating-chats";

export interface FloatingChatState {
  conversation: Conversation;
  contact: Contact | null;
  isMinimized: boolean;
  isMaximized: boolean;
}

interface FloatingChatsContextValue {
  activeChats: FloatingChatState[];
  openChat: (conversation: Conversation, contact: Contact | null) => void;
  closeChat: (conversationId: string) => void;
  minimizeChat: (conversationId: string) => void;
  maximizeChat: (conversationId: string) => void;
  restoreChat: (conversationId: string) => void;
}

const FloatingChatsContext = createContext<FloatingChatsContextValue | null>(null);

export function FloatingChatsProvider({ children }: { children: ReactNode }) {
  const [activeChats, setActiveChats] = useState<FloatingChatState[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveChats(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to parse floating chats from local storage", e);
    }
    setIsLoaded(true);
  }, []);

  // Persist to localStorage whenever chats change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeChats));
    }
  }, [activeChats, isLoaded]);

  const openChat = useCallback((conversation: Conversation, contact: Contact | null) => {
    setActiveChats((prev) => {
      if (prev.some((c) => c.conversation.id === conversation.id)) {
        // If already open, restore it if minimized
        return prev.map((c) =>
          c.conversation.id === conversation.id
            ? { ...c, isMinimized: false }
            : c
        );
      }
      return [
        ...prev,
        { conversation, contact, isMinimized: false, isMaximized: false },
      ];
    });
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setActiveChats((prev) => prev.filter((c) => c.conversation.id !== conversationId));
  }, []);

  const minimizeChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.map((c) =>
        c.conversation.id === conversationId
          ? { ...c, isMinimized: true, isMaximized: false }
          : c
      )
    );
  }, []);

  const maximizeChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.map((c) =>
        c.conversation.id === conversationId
          ? { ...c, isMaximized: true, isMinimized: false }
          : c
      )
    );
  }, []);

  const restoreChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.map((c) =>
        c.conversation.id === conversationId
          ? { ...c, isMaximized: false, isMinimized: false }
          : c
      )
    );
  }, []);

  return (
    <FloatingChatsContext.Provider
      value={{
        activeChats,
        openChat,
        closeChat,
        minimizeChat,
        maximizeChat,
        restoreChat,
      }}
    >
      {children}
    </FloatingChatsContext.Provider>
  );
}

export function useFloatingChats() {
  const ctx = useContext(FloatingChatsContext);
  if (!ctx) {
    throw new Error("useFloatingChats must be used within FloatingChatsProvider");
  }
  return ctx;
}
