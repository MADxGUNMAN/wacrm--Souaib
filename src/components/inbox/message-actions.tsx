"use client";

import { useState, type ReactNode } from "react";
import {
  CornerUpLeft,
  Copy,
  SmilePlus,
  Plus,
  Forward,
  Star,
  Pin,
  Info,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Message } from "@/types";
import { isOutboundSender } from "@/lib/messages/sender-type";
import { useTranslations } from "next-intl";
import { EmojiPicker } from "./emoji-picker/emoji-picker";
import { ForwardDialog } from "./forward-dialog";
import { MessageInfoDialog } from "./message-info-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

// WhatsApp's own quick-reaction bar starts with these six. Picking the same
// set keeps the affordance familiar without pulling in a 300KB emoji library.
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageActionsProps {
  message: Message;
  onReply: () => void;
  onReact: (emoji: string) => void;
  isStarred?: boolean;
  onToggleStar?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onDeleteForMe?: () => void;
  children: ReactNode;
}

/**
 * Hover/long-press toolbar wrapper around a `<MessageBubble>`. The bubble
 * itself stays a pure presenter — this component owns the action surface so
 * the bubble's render path is unaffected when the toolbar isn't visible.
 */
export function MessageActions({
  message,
  onReply,
  onReact,
  isStarred = false,
  onToggleStar,
  isPinned = false,
  onTogglePin,
  onDeleteForMe,
  children,
}: MessageActionsProps) {
  const t = useTranslations("Inbox.actions");
  const confirm = useConfirm();

  // Touch devices have no hover. Long-press fires `contextmenu`; we capture
  // it, suppress the native menu, and pin the toolbar open until the user
  // interacts elsewhere.
  const [touchOpen, setTouchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const isAgent = isOutboundSender(message.sender_type);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setTouchOpen(true);
  };

  const handleCopy = async () => {
    const text = message.content_text ?? "";
    if (!text) {
      toast.error(t("nothingToCopy"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
    setTouchOpen(false);
  };

  const handlePickEmoji = (emoji: string) => {
    onReact(emoji);
    setPickerOpen(false);
    setTouchOpen(false);
  };

  const handleReply = () => {
    onReply();
    setTouchOpen(false);
  };

  // Row alignment lives here (not in MessageBubble) so the `group/actions`
  // hover region matches the bubble's content width — hovering empty space
  // in the row no longer reveals the toolbar.
  return (
    <div
      className={cn(
        "flex w-full",
        isAgent ? "justify-end" : "justify-start",
      )}
      onContextMenu={handleContextMenu}
      onBlur={() => setTouchOpen(false)}
    >
      {/* `min-w-0` lets this flex child actually respect the 75% cap.
       *  Default `min-width: auto` lets content (a long quote preview,
       *  an unbroken URL) push past the cap and shove the row past
       *  100%, which used to bleed across into the contact-sidebar
       *  area. See issue #165. */}
      <div className="group/actions relative min-w-0 max-w-[75%]">
        {children}
      <div
        data-touch-open={touchOpen || pickerOpen ? "true" : undefined}
        className={cn(
          "absolute -top-3 z-10 flex h-7 items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 shadow-md backdrop-blur-sm transition-opacity",
          "opacity-0 group-hover/actions:opacity-100 group-focus-within/actions:opacity-100",
          "data-[touch-open=true]:opacity-100",
          isAgent ? "right-3" : "left-3",
        )}
      >
        <Popover
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open);
            if (!open) setShowFullPicker(false);
          }}
        >
          <PopoverTrigger
            className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("react")}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-1.5 shadow-xl border-border bg-popover"
            sideOffset={6}
          >
            {showFullPicker ? (
              <EmojiPicker
                onSelect={(emoji) => {
                  handlePickEmoji(emoji);
                  setShowFullPicker(false);
                }}
                width={300}
                height={350}
              />
            ) : (
              <div className="flex items-center gap-1">
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handlePickEmoji(e)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted cursor-pointer"
                    aria-label={t("reactWith", { emoji: e })}
                  >
                    {e}
                  </button>
                ))}
                <div className="h-5 w-px bg-border/60 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setShowFullPicker(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="More emojis"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={handleReply}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("reply")}
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("copyText")}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setForwardOpen(true);
            setTouchOpen(false);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label="Send to another chat"
          title="Send to another chat"
        >
          <Forward className="h-3.5 w-3.5" />
        </button>
        {onToggleStar && (
          <button
            type="button"
            onClick={() => {
              onToggleStar();
              setTouchOpen(false);
            }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground",
              isStarred && "text-amber-500 hover:text-amber-600"
            )}
            aria-label={isStarred ? "Unstar message" : "Star message"}
            title={isStarred ? "Unstar message" : "Star message"}
          >
            <Star className={cn("h-3.5 w-3.5", isStarred && "fill-amber-500")} />
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            onClick={() => {
              onTogglePin();
              setTouchOpen(false);
            }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground",
              isPinned && "text-primary hover:text-primary/90"
            )}
            aria-label={isPinned ? "Unpin message" : "Pin message"}
            title={isPinned ? "Unpin message" : "Pin message"}
          >
            <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-primary")} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setInfoOpen(true);
            setTouchOpen(false);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label="Message info"
          title="Message info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {onDeleteForMe && (
          <button
            type="button"
            onClick={async () => {
              setTouchOpen(false);
              const ok = await confirm({
                title: "Delete message for me?",
                description:
                  "This will hide the message from your view in this CRM. It will NOT be deleted from the customer's phone or other agents' views.",
                confirmText: "Delete for me",
                cancelText: "Cancel",
                variant: "destructive",
              });
              if (ok) {
                onDeleteForMe();
              }
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete for me"
            title="Delete for me (hide locally)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      </div>

      <ForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        message={message}
        currentConversationId={message.conversation_id}
      />

      <MessageInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        message={message}
      />
    </div>
  );
}
