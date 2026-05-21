'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Tag, Contact } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Users,
  Tags,
  Search,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
} from 'lucide-react';

type AudienceType = 'all' | 'tags' | 'specific_contacts' | 'csv';

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  contactIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const audienceOptions: {
  type: AudienceType;
  label: string;
  description: string;
  icon: typeof Users;
}[] = [
  {
    type: 'all',
    label: 'All Contacts',
    description: 'Send to every contact in your database',
    icon: Users,
  },
  {
    type: 'tags',
    label: 'Filter by Tags',
    description: 'Target contacts with specific tags',
    icon: Tags,
  },
  {
    type: 'specific_contacts',
    label: 'Specific Contacts',
    description: 'Search and select individual contacts',
    icon: Search,
  },
  {
    type: 'csv',
    label: 'Upload CSV',
    description: 'Upload a list of phone numbers',
    icon: Upload,
  },
];


export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContactsMap, setSelectedContactsMap] = useState<Map<string, Contact>>(new Map());
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Debounced search for specific contacts
  useEffect(() => {
    if (audience.type !== 'specific_contacts') return;
    
    const handler = setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const supabase = createClient();
        let query = supabase.from('contacts').select('*');
        if (contactSearchQuery.trim()) {
          query = query.or(`name.ilike.%${contactSearchQuery}%,phone.ilike.%${contactSearchQuery}%`);
        }
        const { data } = await query.limit(50);
        setSearchResults(data ?? []);
      } finally {
        setSearchingContacts(false);
      }
    }, 300);
    
    return () => clearTimeout(handler);
  }, [contactSearchQuery, audience.type]);

  // Load already selected contacts to display in chips
  useEffect(() => {
    if (audience.type === 'specific_contacts' && audience.contactIds && audience.contactIds.length > 0) {
      const missingIds = audience.contactIds.filter(id => !selectedContactsMap.has(id));
      if (missingIds.length > 0) {
        const fetchMissing = async () => {
          const supabase = createClient();
          const { data } = await supabase.from('contacts').select('*').in('id', missingIds);
          if (data) {
            setSelectedContactsMap(prev => {
              const newMap = new Map(prev);
              data.forEach(c => newMap.set(c.id, c));
              return newMap;
            });
          }
        };
        fetchMissing();
      }
    }
  }, [audience.type, audience.contactIds, selectedContactsMap]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'specific_contacts' &&
        audience.contactIds &&
        audience.contactIds.length > 0
      ) {
        baseIds = new Set(audience.contactIds);
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter(
          (id) => !excludeSet?.has(id),
        );
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.contactIds,
    audience.csvContacts,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function toggleContact(contact: Contact) {
    const current = audience.contactIds ?? [];
    const updated = current.includes(contact.id)
      ? current.filter((id) => id !== contact.id)
      : [...current, contact.id];
      
    if (!current.includes(contact.id)) {
      setSelectedContactsMap(prev => {
        const newMap = new Map(prev);
        newMap.set(contact.id, contact);
        return newMap;
      });
    }
      
    onUpdate({ ...audience, contactIds: updated });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'specific_contacts' && audience.contactIds && audience.contactIds.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Select Audience</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose who will receive this broadcast.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map((option) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() =>
                onUpdate({
                  ...audience,
                  type: option.type,
                  // Wipe shape fields from other types to avoid stale
                  // config leaking across selections.
                  tagIds: option.type === 'tags' ? audience.tagIds : undefined,
                  contactIds: option.type === 'specific_contacts' ? audience.contactIds : undefined,
                  csvContacts: option.type === 'csv' ? audience.csvContacts : undefined,
                })
              }
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30'
                  : 'border-border bg-card/50 hover:border-border'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-violet-500/10 text-violet-600'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Select Tags</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tags found. Create tags in Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-violet-200 bg-violet-500/10 text-violet-600'
                        : 'border-border bg-muted text-muted-foreground hover:border-slate-600'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'specific_contacts' && (
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Select Contacts</p>
            <p className="text-xs text-muted-foreground">Search and select individual contacts for this broadcast.</p>
          </div>
          
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={contactSearchQuery}
                onChange={(e) => setContactSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                className="h-10 w-full rounded-lg border border-border bg-muted pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              {searchingContacts && (
                <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown for search results */}
            {isSearchFocused && searchResults.length > 0 && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
              >
                {searchResults.map((contact) => {
                  const isSelected = audience.contactIds?.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      onClick={() => toggleContact(contact)}
                      className="flex w-full items-center justify-between border-b border-border/50 px-4 py-2.5 text-left transition-colors hover:bg-muted last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {contact.name || 'Unknown Name'}
                        </p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-violet-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            
            {isSearchFocused && searchResults.length === 0 && !searchingContacts && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-card p-4 text-center shadow-lg"
              >
                <p className="text-sm text-muted-foreground">No contacts found.</p>
              </div>
            )}
          </div>

          {/* Selected Contacts Chips */}
          {(audience.contactIds?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {audience.contactIds!.map((id) => {
                const contact = selectedContactsMap.get(id);
                if (!contact) return null;
                return (
                  <div
                    key={contact.id}
                    className="inline-flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/50 pl-3 pr-2 py-1.5 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400"
                  >
                    <div className="flex flex-col max-w-[150px]">
                      <span className="truncate text-xs font-medium">{contact.name || 'Unknown Name'}</span>
                      <span className="truncate text-[10px] opacity-70">{contact.phone}</span>
                    </div>
                    <button
                      onClick={() => toggleContact(contact)}
                      className="rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-500/20 transition-colors shrink-0 mt-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-600" />
          <p className="text-sm font-medium text-foreground">
            Exclude contacts with these tags
          </p>
          <span className="text-xs text-muted-foreground">(optional)</span>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-200 bg-red-500/10 text-red-700'
                      : 'border-border bg-muted text-muted-foreground hover:border-slate-600'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Audience Summary</p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <span className="text-xs text-muted-foreground">Calculating…</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-600" />
            <span className="text-sm text-foreground">
              {estimatedCount.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">estimated recipients</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select an audience type to see the estimate.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
