"use client";

import { useFloatingChats } from "./floating-chats-context";
import { FloatingChatWindow } from "./floating-chat-window";
import { useEffect, useState } from "react";

export function FloatingChatsRenderer() {
  const { activeChats } = useFloatingChats();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {activeChats.map((chat, index) => (
        <FloatingChatWindow
          key={chat.conversation.id}
          chat={chat}
          defaultIndex={index}
        />
      ))}
    </>
  );
}
