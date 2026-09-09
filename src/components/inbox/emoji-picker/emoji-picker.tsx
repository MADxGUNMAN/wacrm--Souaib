'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/hooks/use-theme';
import { Theme, EmojiStyle, type EmojiClickData } from 'emoji-picker-react';
import { Loader2 } from 'lucide-react';

const Picker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-[330px] items-center justify-center bg-popover text-xs text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Loading emojis...
    </div>
  ),
});

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  width?: number | string;
  height?: number | string;
  lazyLoadEmojis?: boolean;
}

export function EmojiPicker({
  onSelect,
  width = 330,
  height = 380,
  lazyLoadEmojis = true,
}: EmojiPickerProps) {
  const { mode } = useTheme();

  const pickerTheme =
    mode === 'dark' ? Theme.DARK : mode === 'light' ? Theme.LIGHT : Theme.AUTO;

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onSelect(emojiData.emoji);
  };

  return (
    <div className="overflow-hidden rounded-xl shadow-2xl border border-border bg-popover">
      <Picker
        onEmojiClick={handleEmojiClick}
        theme={pickerTheme}
        emojiStyle={EmojiStyle.NATIVE}
        width={width}
        height={height}
        lazyLoadEmojis={lazyLoadEmojis}
        searchPlaceHolder="Search all emojis..."
        previewConfig={{
          showPreview: false,
        }}
      />
    </div>
  );
}
