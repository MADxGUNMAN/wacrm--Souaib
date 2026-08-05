"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface TableOfContentsProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const navRef = useRef<HTMLOListElement>(null);

  const calculateActiveHeading = useCallback(() => {
    // Threshold is sticky header height + some buffer
    const THRESHOLD = 162; // ~112px header + 50px

    let currentActiveId = null;

    // Iterate to find the last heading above the threshold
    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.top <= THRESHOLD) {
          currentActiveId = heading.id;
        } else {
          // Since headings are in order, once we find one below threshold, we stop
          break;
        }
      }
    }

    // Edge case: if we are at the absolute bottom of the page, force the last heading to be active
    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 10
    ) {
      if (headings.length > 0) {
        currentActiveId = headings[headings.length - 1].id;
      }
    }

    // If nothing passed threshold, highlight the first one (or none). Let's use first one if it exists.
    if (!currentActiveId && headings.length > 0) {
      currentActiveId = headings[0].id;
    }

    setActiveId(currentActiveId);
  }, [headings]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          calculateActiveHeading();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    // Initial calculation
    calculateActiveHeading();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [calculateActiveHeading]);

  // Auto-scroll TOC container
  useEffect(() => {
    if (!activeId || !navRef.current) return;

    const box = navRef.current;
    const link = box.querySelector(`[data-toc-id="${CSS.escape(activeId)}"]`) as HTMLElement;
    
    if (!link) return;

    const viewTop = box.scrollTop;
    const viewBottom = viewTop + box.clientHeight;
    
    const top = link.offsetTop;
    const bottom = top + link.offsetHeight;
    
    let next = null;
    const margin = 12;

    if (top < viewTop + margin) {
      next = top - margin;
    } else if (bottom > viewBottom - margin) {
      next = bottom - box.clientHeight + margin;
    }

    if (next !== null) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({
        top: Math.max(0, next),
        behavior: prefersReducedMotion ? "instant" : "smooth",
      });
    }
  }, [activeId]);

  if (headings.length === 0) return null;

  const content = (
    <>
      <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2 shrink-0">
        <svg
          className="h-3.5 w-3.5 text-[#25D366]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h10M4 18h14"
          />
        </svg>
        On this page
      </h2>
      <ol
        ref={navRef}
        className="space-y-0.5 list-none flex-1 min-h-0 overflow-y-auto scrollbar-sleek overscroll-contain relative"
      >
        {headings.map((heading, index) => {
          // Check if a child is active
          let isChildActive = false;
          if (heading.level === 2) {
            // Find children h3s until the next h2
            for (let i = index + 1; i < headings.length; i++) {
              if (headings[i].level === 2) break;
              if (headings[i].id === activeId) {
                isChildActive = true;
                break;
              }
            }
          }

          const isActive = heading.id === activeId;

          return (
            <li key={index}>
              <a
                href={`#${heading.id}`}
                data-toc-id={heading.id}
                aria-current={isActive ? "location" : undefined}
                className={`
                  block transition-colors duration-150 hover:text-[#25D366]
                  ${
                    heading.level === 2
                      ? `text-[13px] font-medium py-1.5 pl-3 border-l-2 ${
                          isActive
                            ? "text-[#25D366] border-[#25D366]"
                            : isChildActive
                            ? "text-slate-900 border-slate-300"
                            : "text-slate-700 border-transparent hover:border-[#25D366]"
                        }`
                      : `text-[12px] pl-6 py-1 border-l-2 ${
                          isActive
                            ? "text-[#25D366] border-[#25D366]"
                            : "text-slate-400 border-transparent hover:border-[#25D366]/50"
                        }`
                  }
                `}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </>
  );

  return (
    <>
      {/* Desktop TOC */}
      <aside className="hidden lg:flex w-64 shrink-0 self-start sticky top-28 h-[calc(100vh-8rem)]">
        <nav className="flex flex-col w-full h-full rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          {content}
        </nav>
      </aside>

      {/* Mobile TOC */}
      <div className="lg:hidden mb-8">
        <details className="group rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
          <summary className="p-4 text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-[#25D366]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h10M4 18h14"
                />
              </svg>
              On this page
            </div>
            <svg
              className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform duration-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-4 pb-4 max-h-64 overflow-y-auto scrollbar-sleek border-t border-slate-200 pt-3">
            <ol className="space-y-1 list-none">
              {headings.map((heading, index) => {
                const isActive = heading.id === activeId;
                return (
                  <li key={index}>
                    <a
                      href={`#${heading.id}`}
                      aria-current={isActive ? "location" : undefined}
                      onClick={(e) => {
                        // Close details on mobile
                        const details = e.currentTarget.closest("details");
                        if (details) details.removeAttribute("open");
                      }}
                      className={`
                        block transition-colors duration-150 hover:text-[#25D366]
                        ${
                          heading.level === 2
                            ? `text-[14px] font-medium py-1.5 pl-3 border-l-2 ${
                                isActive
                                  ? "text-[#25D366] border-[#25D366]"
                                  : "text-slate-700 border-slate-200 hover:border-[#25D366]"
                              }`
                            : `text-[13px] pl-6 py-1 border-l-2 ${
                                isActive
                                  ? "text-[#25D366] border-[#25D366]"
                                  : "text-slate-500 border-slate-200 hover:border-[#25D366]/50"
                              }`
                        }
                      `}
                    >
                      {heading.text}
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        </details>
      </div>
    </>
  );
}
