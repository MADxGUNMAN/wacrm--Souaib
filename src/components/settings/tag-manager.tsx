'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Loader2, Search, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Tag, Contact } from '@/types';

const PRESET_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
];

export function TagManager() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[3].value);

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Map<string, Contact>>(new Map());
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    
    const handler = setTimeout(async () => {
      setSearchingContacts(true);
      try {
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
  }, [contactSearchQuery, dialogOpen, supabase]);

  function toggleContact(contact: Contact) {
    setSelectedContacts(prev => {
      const next = new Map(prev);
      if (next.has(contact.id)) {
        next.delete(contact.id);
      } else {
        next.set(contact.id, contact);
      }
      return next;
    });
  }

  async function openEditDialog(tag: Tag) {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setSelectedColor(tag.color);
    setDialogOpen(true);
    
    try {
      const { data, error } = await supabase
        .from('contact_tags')
        .select('contact_id, contacts(*)')
        .eq('tag_id', tag.id);
        
      if (!error && data) {
        const map = new Map<string, Contact>();
        for (const row of data) {
          // @ts-ignore
          if (row.contacts) map.set(row.contact_id, row.contacts as Contact);
        }
        setSelectedContacts(map);
      }
    } catch (err) {
      console.error('Failed to load contacts for tag:', err);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchTags(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  async function fetchTags(userId: string) {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('tags')
        .select(`
          *,
          contact_tags(
            contacts(
              name,
              phone
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTags(data || []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!newTagName.trim()) {
      toast.error('Tag name is required');
      return;
    }

    try {
      setSaving(true);
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      let tagId = editingTag?.id;

      if (editingTag) {
        const { error } = await supabase
          .from('tags')
          .update({
            name: newTagName.trim(),
            color: selectedColor,
          })
          .eq('id', editingTag.id);
        if (error) throw error;
        
        await supabase.from('contact_tags').delete().eq('tag_id', editingTag.id);
      } else {
        const { data: newTag, error } = await supabase
          .from('tags')
          .insert({
            user_id: user.id,
            name: newTagName.trim(),
            color: selectedColor,
          })
          .select()
          .single();
        if (error) throw error;
        tagId = newTag.id;
      }

      if (selectedContacts.size > 0 && tagId) {
        const contactTagsToInsert = Array.from(selectedContacts.keys()).map(contactId => ({
          contact_id: contactId,
          tag_id: tagId
        }));
        
        const { error: assignError } = await supabase
          .from('contact_tags')
          .insert(contactTagsToInsert);
          
        if (assignError) throw assignError;
      }

      toast.success(editingTag ? 'Tag updated successfully' : 'Tag created successfully');
      setDialogOpen(false);
      setEditingTag(null);
      setNewTagName('');
      setSelectedColor(PRESET_COLORS[3].value);
      setSelectedContacts(new Map());
      setContactSearchQuery('');
      if (user) await fetchTags(user.id);
    } catch (err) {
      console.error('Save error:', err);
      toast.error(editingTag ? 'Failed to update tag' : 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(tag: Tag) {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!tagToDelete) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagToDelete.id);

      if (error) throw error;

      toast.success('Tag deleted');
      setTags((prev) => prev.filter((t) => t.id !== tagToDelete.id));
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete tag');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tags</h2>
          <p className="text-sm text-muted-foreground">Organize your contacts with color-coded tags.</p>
        </div>
        <Button
          onClick={() => {
            setEditingTag(null);
            setNewTagName('');
            setSelectedColor(PRESET_COLORS[3].value);
            setSelectedContacts(new Map());
            setContactSearchQuery('');
            setDialogOpen(true);
          }}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          <Plus className="size-4" />
          New Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <Card className="bg-card border-border ring-0 ring-transparent">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground text-sm">No tags yet.</p>
            <p className="text-muted-foreground text-xs mt-1">Create tags to categorize your contacts.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border ring-0 ring-transparent">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              <TooltipProvider delay={300}>
                {tags.map((tag) => (
                  <Tooltip key={tag.id}>
                    <TooltipTrigger
                      render={<span />}
                      className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all cursor-pointer hover:ring-2 hover:ring-violet-500/50"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        border: `1px solid ${tag.color}40`,
                      }}
                      onClick={() => openEditDialog(tag)}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      <div
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(tag);
                        }}
                        className="ml-0.5 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 flex items-center justify-center"
                      >
                        <X className="size-3" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px] p-3">
                      <div className="space-y-2">
                        <p className="font-semibold text-sm border-b border-background/20 pb-2">
                          {tag.contact_tags?.length || 0} Contact{(tag.contact_tags?.length !== 1) ? 's' : ''}
                        </p>
                        <div className="max-h-48 overflow-y-auto pr-2 space-y-2">
                          {tag.contact_tags?.map((ct: any, idx: number) => {
                            const contact = Array.isArray(ct.contacts) ? ct.contacts[0] : ct.contacts;
                            if (!contact) return null;
                            return (
                              <div key={idx} className="flex flex-col">
                                <span className="text-xs font-medium">{contact.name || 'Unknown Name'}</span>
                                <span className="text-[10px] opacity-70">{contact.phone}</span>
                              </div>
                            )
                          })}
                          {(!tag.contact_tags || tag.contact_tags.length === 0) && (
                            <p className="text-xs opacity-70">No contacts assigned</p>
                          )}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Tag Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingTag ? 'Edit Tag' : 'New Tag'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingTag ? 'Modify your tag name, color, and associated contacts.' : 'Create a new tag with a name and color.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Tag Name</Label>
              <Input
                placeholder="e.g. VIP Customer"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className="relative size-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900"
                    style={{
                      backgroundColor: color.value,
                      boxShadow: selectedColor === color.value ? `0 0 0 2px rgb(15 23 42), 0 0 0 4px ${color.value}` : 'none',
                    }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Contact Search */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Assign Contacts (Optional)</Label>
              <div className="relative">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone..."
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                    className="pl-9 pr-4 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  {searchingContacts && (
                    <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Search Results */}
                {isSearchFocused && searchResults.length > 0 && (
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
                  >
                    {searchResults.map((contact) => {
                      const isSelected = selectedContacts.has(contact.id);
                      return (
                        <button
                          key={contact.id}
                          onClick={() => toggleContact(contact)}
                          className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-muted last:border-0"
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
                    className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-card p-3 text-center shadow-lg"
                  >
                    <p className="text-sm text-muted-foreground">No contacts found.</p>
                  </div>
                )}
              </div>

              {/* Selected Chips */}
              {selectedContacts.size > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 max-h-32 overflow-y-auto">
                  {Array.from(selectedContacts.values()).map(contact => (
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
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Preview</Label>
              <div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
                  style={{
                    backgroundColor: `${selectedColor}20`,
                    color: selectedColor,
                    border: `1px solid ${selectedColor}40`,
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: selectedColor }}
                  />
                  {newTagName || 'Tag Name'}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="bg-card border-border">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {editingTag ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                editingTag ? 'Save Changes' : 'Create Tag'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Tag</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete the tag &quot;{tagToDelete?.name}&quot;? This will remove
              it from all contacts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-card border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Tag'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
