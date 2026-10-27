'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  Image as ImageIcon,
  Link2,
  Quote,
  ChevronDown,
  Maximize2,
  Minimize2,
  Eye,
  FileText,
  Minus,
  Table as TableIcon,
} from 'lucide-react';
import { MarkdownPreview } from './markdown-preview';

interface StrapiMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  documentTitle?: string;
  placeholder?: string;
  className?: string;
}

export function StrapiMarkdownEditor({
  value,
  onChange,
  documentTitle = 'Legal Document',
  placeholder = 'Write your markdown content here...',
  className = '',
}: StrapiMarkdownEditorProps) {
  // Mode states: 'edit' (standard markdown edit), 'preview' (in-place rendered preview)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  // Full-screen split view modal: true / false
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  // Headings dropdown open state
  const [headingsOpen, setHeadingsOpen] = useState<boolean>(false);

  // References to textareas (standard & expanded)
  const standardTextareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Active textarea depending on expanded mode
  const getActiveTextarea = useCallback((): HTMLTextAreaElement | null => {
    if (isExpanded) {
      return expandedTextareaRef.current;
    }
    return standardTextareaRef.current;
  }, [isExpanded]);

  // Close headings dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setHeadingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle ESC key to collapse expanded view
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Core Text Insertion Engine
  const insertFormatting = useCallback(
    ({
      prefix,
      suffix = '',
      placeholderText = '',
      blockPrefix = '',
      isLinePrefix = false,
    }: {
      prefix?: string;
      suffix?: string;
      placeholderText?: string;
      blockPrefix?: string;
      isLinePrefix?: boolean;
    }) => {
      // If we are in in-place preview mode, switch back to edit mode first
      if (viewMode === 'preview') {
        setViewMode('edit');
      }

      const textarea = getActiveTextarea();
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      let replacement = '';
      let newCursorStart = start;
      let newCursorEnd = end;

      if (isLinePrefix && blockPrefix) {
        // Line-based prefix (Headings, Lists, Quotes)
        // Find the start of the current line
        const beforeSelection = value.substring(0, start);
        const lastNewline = beforeSelection.lastIndexOf('\n');
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

        // Strip existing heading or list prefix if present
        const currentLine = value.substring(
          lineStart,
          value.indexOf('\n', lineStart) === -1
            ? value.length
            : value.indexOf('\n', lineStart)
        );
        const cleanedLine = currentLine.replace(
          /^(#{1,6}\s+|-\s+|\d+\.\s+|>\s+)/,
          ''
        );
        const newLine = `${blockPrefix}${cleanedLine}`;

        const newValue =
          value.substring(0, lineStart) +
          newLine +
          value.substring(lineStart + currentLine.length);

        onChange(newValue);

        setTimeout(() => {
          textarea.focus();
          const targetCursor = lineStart + newLine.length;
          textarea.setSelectionRange(targetCursor, targetCursor);
        }, 10);
        return;
      }

      if (selectedText) {
        // Wrap selected text
        replacement = `${prefix || ''}${selectedText}${suffix || ''}`;
        newCursorStart = start;
        newCursorEnd = start + replacement.length;
      } else {
        // Insert with placeholder text and highlight the placeholder
        const textToInsert = placeholderText || 'text';
        replacement = `${prefix || ''}${textToInsert}${suffix || ''}`;
        newCursorStart = start + (prefix ? prefix.length : 0);
        newCursorEnd = newCursorStart + textToInsert.length;
      }

      const newValue =
        value.substring(0, start) + replacement + value.substring(end);
      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorStart, newCursorEnd);
      }, 10);
    },
    [value, onChange, viewMode, getActiveTextarea]
  );

  // Keyboard shortcut listeners (Ctrl+B, Ctrl+I, Ctrl+U)
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        insertFormatting({
          prefix: '**',
          suffix: '**',
          placeholderText: 'Bold text',
        });
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        insertFormatting({
          prefix: '*',
          suffix: '*',
          placeholderText: 'Italic text',
        });
      } else if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        insertFormatting({
          prefix: '<u>',
          suffix: '</u>',
          placeholderText: 'Underline text',
        });
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        insertFormatting({
          prefix: '[',
          suffix: '](https://example.com)',
          placeholderText: 'Link text',
        });
      }
    }
  };

  // Specific format triggers
  const handleHeading = (level: number) => {
    setHeadingsOpen(false);
    if (level === 0) {
      // Normal paragraph
      insertFormatting({ blockPrefix: '', isLinePrefix: true });
    } else {
      insertFormatting({
        blockPrefix: `${'#'.repeat(level)} `,
        isLinePrefix: true,
      });
    }
  };

  const handleLink = () => {
    insertFormatting({
      prefix: '[',
      suffix: '](https://example.com)',
      placeholderText: 'Link text',
    });
  };

  const handleImage = () => {
    insertFormatting({
      prefix: '![',
      suffix: '](https://example.com/image.png)',
      placeholderText: 'Image description',
    });
  };

  const handleTable = () => {
    const tableTemplate = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Value 1 | Value 2 | Value 3 |\n| Value 4 | Value 5 | Value 6 |\n\n`;
    insertFormatting({
      prefix: tableTemplate,
      suffix: '',
      placeholderText: '',
    });
  };

  // Metrics
  const wordsCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const linesCount = value ? value.split('\n').length : 0;
  const charsCount = value.length;

  // Reusable Toolbar Component
  const renderToolbar = (isSplit = false) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2 select-none sm:px-4">
      {/* Left Formatting Tools Group */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {/* Headings Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setHeadingsOpen(!headingsOpen)}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden"
            title="Headings"
          >
            <span>Headings</span>
            <ChevronDown className="size-3.5 text-slate-500" />
          </button>

          {headingsOpen && (
            <div className="animate-in fade-in-80 zoom-in-95 absolute top-full left-0 z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
              <button
                type="button"
                onClick={() => handleHeading(0)}
                className="w-full px-3 py-1.5 text-left text-xs font-normal text-slate-700 hover:bg-slate-100"
              >
                Normal Text
              </button>
              <div className="my-1 border-t border-slate-100" />
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleHeading(level)}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-slate-800 hover:bg-slate-100 ${
                    level === 1
                      ? 'text-sm font-bold'
                      : level === 2
                        ? 'text-xs font-bold'
                        : level === 3
                          ? 'text-xs font-semibold'
                          : 'text-xs font-medium text-slate-600'
                  }`}
                >
                  <span>Heading {level}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {'#'.repeat(level)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        {/* Inline Formatting */}
        <ToolbarButton
          icon={<Bold className="size-3.5" />}
          label="Bold (Ctrl+B)"
          onClick={() =>
            insertFormatting({
              prefix: '**',
              suffix: '**',
              placeholderText: 'Bold text',
            })
          }
        />
        <ToolbarButton
          icon={<Italic className="size-3.5" />}
          label="Italic (Ctrl+I)"
          onClick={() =>
            insertFormatting({
              prefix: '*',
              suffix: '*',
              placeholderText: 'Italic text',
            })
          }
        />
        <ToolbarButton
          icon={<UnderlineIcon className="size-3.5" />}
          label="Underline (Ctrl+U)"
          onClick={() =>
            insertFormatting({
              prefix: '<u>',
              suffix: '</u>',
              placeholderText: 'Underline text',
            })
          }
        />
        <ToolbarButton
          icon={<Strikethrough className="size-3.5" />}
          label="Strikethrough"
          onClick={() =>
            insertFormatting({
              prefix: '~~',
              suffix: '~~',
              placeholderText: 'Strikethrough text',
            })
          }
        />

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        {/* Lists & Quotes */}
        <ToolbarButton
          icon={<List className="size-3.5" />}
          label="Bullet List"
          onClick={() =>
            insertFormatting({ blockPrefix: '- ', isLinePrefix: true })
          }
        />
        <ToolbarButton
          icon={<ListOrdered className="size-3.5" />}
          label="Numbered List"
          onClick={() =>
            insertFormatting({ blockPrefix: '1. ', isLinePrefix: true })
          }
        />
        <ToolbarButton
          icon={<Code className="size-3.5" />}
          label="Code Block"
          onClick={() =>
            insertFormatting({
              prefix: '```\n',
              suffix: '\n```',
              placeholderText: 'code here',
            })
          }
        />
        <ToolbarButton
          icon={<Quote className="size-3.5" />}
          label="Quote"
          onClick={() =>
            insertFormatting({ blockPrefix: '> ', isLinePrefix: true })
          }
        />

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        {/* Media & Structures */}
        <ToolbarButton
          icon={<Link2 className="size-3.5" />}
          label="Insert Link (Ctrl+K)"
          onClick={handleLink}
        />
        <ToolbarButton
          icon={<ImageIcon className="size-3.5" />}
          label="Insert Image"
          onClick={handleImage}
        />
        <ToolbarButton
          icon={<TableIcon className="size-3.5" />}
          label="Insert Table"
          onClick={handleTable}
        />
        <ToolbarButton
          icon={<Minus className="size-3.5" />}
          label="Horizontal Divider"
          onClick={() =>
            insertFormatting({
              prefix: '\n\n---\n\n',
              suffix: '',
              placeholderText: '',
            })
          }
        />
      </div>

      {/* Right Mode Toggle (Only in non-split standard mode) */}
      {!isSplit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setViewMode((prev) => (prev === 'edit' ? 'preview' : 'edit'))
            }
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-all ${
              viewMode === 'preview'
                ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {viewMode === 'edit' ? (
              <>
                <Eye className="size-3.5" />
                <span>Preview mode</span>
              </>
            ) : (
              <>
                <FileText className="size-3.5" />
                <span>Markdown mode</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Standard In-Page Editor Box */}
      <div
        className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}
      >
        {/* Top Strapi-Style Toolbar */}
        {renderToolbar(false)}

        {/* Main Content Area: Edit or Preview */}
        <div className="relative h-[520px] min-h-[460px]">
          {viewMode === 'edit' ? (
            <textarea
              ref={standardTextareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder={placeholder}
              className="selection:bg-primary/20 size-full resize-none overflow-y-auto border-0 bg-transparent p-5 font-mono text-sm leading-relaxed text-slate-900 focus:ring-0 focus:outline-hidden"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent',
              }}
            />
          ) : (
            <div
              className="size-full overflow-y-auto bg-slate-50/40 p-6"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent',
              }}
            >
              <MarkdownPreview content={value} />
            </div>
          )}

          {/* Bottom Right Floating Expand Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="absolute right-4 bottom-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            title="Expand to Fullscreen Split-Screen View"
          >
            <span>Expand</span>
            <Maximize2 className="size-3.5" />
          </button>
        </div>

        {/* Bottom Status & Counter Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              Lines:{' '}
              <strong className="font-mono text-slate-700">{linesCount}</strong>
            </span>
            <span>•</span>
            <span>
              Words:{' '}
              <strong className="font-mono text-slate-700">{wordsCount}</strong>
            </span>
            <span>•</span>
            <span>
              Characters:{' '}
              <strong className="font-mono text-slate-700">{charsCount}</strong>
            </span>
          </div>
          <span className="hidden text-slate-400 sm:inline">
            Markdown formatting supported (GFM)
          </span>
        </div>
      </div>

      {/* Expanded Full-Screen Split View Modal (Matching Strapi Screenshot 3) */}
      {isExpanded && (
        <div className="animate-in fade-in-50 fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-5 lg:p-6">
          <div className="flex h-full max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Expanded Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-md">
                  <FileText className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight text-slate-900">
                    {documentTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Split-Screen Live Markdown Editor & Frontend Preview
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900"
                  title="Collapse (Esc)"
                >
                  <span>Collapse</span>
                  <Minimize2 className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Split Screen Columns: Left Editor + Right Live Preview */}
            <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
              {/* Left Column: Markdown Editor */}
              <div className="flex flex-col overflow-hidden border-b border-slate-200 lg:border-r lg:border-b-0">
                {/* Full Toolbar */}
                {renderToolbar(true)}

                {/* Textarea */}
                <textarea
                  ref={expandedTextareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  placeholder={placeholder}
                  className="selection:bg-primary/20 size-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-6 font-mono text-sm leading-relaxed text-slate-900 focus:ring-0 focus:outline-hidden"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#cbd5e1 transparent',
                  }}
                />
              </div>

              {/* Right Column: Live Frontend Preview */}
              <div className="flex flex-col overflow-hidden bg-slate-50/30">
                {/* Right Column Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/70 px-5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-700 uppercase">
                    <Eye className="text-primary size-3.5" />
                    <span>Live Frontend Preview</span>
                  </span>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                    Synchronized
                  </span>
                </div>

                {/* Live Render Area */}
                <div
                  className="flex-1 overflow-y-auto p-8"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#cbd5e1 transparent',
                  }}
                >
                  <MarkdownPreview content={value} />
                </div>
              </div>
            </div>

            {/* Bottom Status Bar in Expanded View */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span>
                  Lines:{' '}
                  <strong className="font-mono text-slate-700">
                    {linesCount}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Words:{' '}
                  <strong className="font-mono text-slate-700">
                    {wordsCount}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Characters:{' '}
                  <strong className="font-mono text-slate-700">
                    {charsCount}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Press{' '}
                  <kbd className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                    Esc
                  </kbd>{' '}
                  to exit full-screen
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-2xs focus:outline-hidden"
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
