'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Search,
  User,
  Phone,
  Building,
  Mail,
  Check,
  Loader2,
} from 'lucide-react';
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import { formatPhoneNumber } from '@/lib/phone/countries';
import type { WhatsAppContactCard } from '@/lib/whatsapp/meta-api';
import { toast } from 'sonner';

interface ContactPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendContacts: (contacts: WhatsAppContactCard[]) => Promise<void> | void;
}

interface CrmContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
}

export function ContactPickerDialog({
  open,
  onOpenChange,
  onSendContacts,
}: ContactPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<'crm' | 'manual'>('crm');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  // Manual contact form state
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const fetchContacts = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      let req = supabase
        .from('contacts')
        .select('id, name, phone, email, company')
        .order('name', { ascending: true })
        .limit(30);

      if (query.trim()) {
        const q = `%${query.trim()}%`;
        req = req.or(
          `name.ilike.${q},phone.ilike.${q},company.ilike.${q},email.ilike.${q}`
        );
      }

      const { data, error } = await req;
      if (error) {
        console.error('[contact-picker] search error:', error);
      } else {
        setContacts(data || []);
      }
    } catch (err) {
      console.error('[contact-picker] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchContacts(searchQuery);
    } else {
      setSelectedContact(null);
      setSearchQuery('');
      setManualName('');
      setManualPhone('');
      setManualCompany('');
      setManualEmail('');
    }
  }, [open, fetchContacts, searchQuery]);

  const handleSendCrmContact = async () => {
    if (!selectedContact) return;
    setSubmitting(true);
    try {
      const cleanPhone = sanitizePhoneForMeta(selectedContact.phone);
      const nameParts = (selectedContact.name || 'Contact').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Contact';
      const lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      const card: WhatsAppContactCard = {
        name: {
          formatted_name: selectedContact.name?.trim() || selectedContact.phone,
          first_name: firstName,
          last_name: lastName,
        },
        phones: [
          {
            phone: selectedContact.phone,
            type: 'Mobile',
            wa_id: cleanPhone || undefined,
          },
        ],
        org: selectedContact.company
          ? { company: selectedContact.company }
          : undefined,
        emails: selectedContact.email
          ? [{ email: selectedContact.email, type: 'Work' }]
          : undefined,
      };

      await onSendContacts([card]);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to send contact card');
      console.error('[contact-picker] send error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendManualContact = async () => {
    if (!manualName.trim() || !manualPhone.trim()) {
      toast.error('Name and Phone Number are required');
      return;
    }
    setSubmitting(true);
    try {
      const cleanPhone = sanitizePhoneForMeta(manualPhone.trim());
      const nameParts = manualName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Contact';
      const lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      const card: WhatsAppContactCard = {
        name: {
          formatted_name: manualName.trim(),
          first_name: firstName,
          last_name: lastName,
        },
        phones: [
          {
            phone: manualPhone.trim(),
            type: 'Mobile',
            wa_id: cleanPhone || undefined,
          },
        ],
        org: manualCompany.trim()
          ? { company: manualCompany.trim() }
          : undefined,
        emails: manualEmail.trim()
          ? [{ email: manualEmail.trim(), type: 'Work' }]
          : undefined,
      };

      await onSendContacts([card]);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to send contact card');
      console.error('[contact-picker] send error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <User className="text-primary h-5 w-5" />
            Share Contact Card
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'crm' | 'manual')}
        >
          <TabsList className="mb-3 grid w-full grid-cols-2">
            <TabsTrigger value="crm">From CRM</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="crm" className="space-y-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search CRM contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            <ScrollArea className="h-64 rounded-md border p-2">
              {loading ? (
                <div className="flex h-full items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No contacts found.
                </div>
              ) : (
                <div className="space-y-1">
                  {contacts.map((c) => {
                    const isSelected = selectedContact?.id === c.id;
                    const initials = (c.name || c.phone)
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedContact(c)}
                        className={`flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-primary/10 border-primary/40 border'
                            : 'hover:bg-muted/70'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-foreground truncate text-sm font-medium">
                              {c.name || 'Unnamed Contact'}
                            </p>
                            <p className="text-muted-foreground truncate font-mono text-xs">
                              {formatPhoneNumber(c.phone)}{' '}
                              {c.company ? `• ${c.company}` : ''}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendCrmContact}
                disabled={!selectedContact || submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Contact Card'
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3">
            <div className="space-y-3">
              <div>
                <Label htmlFor="manual-name" className="text-xs">
                  Full Name *
                </Label>
                <div className="relative mt-1">
                  <User className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="manual-name"
                    placeholder="e.g. Barbara Johnson"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="manual-phone" className="text-xs">
                  Phone Number *
                </Label>
                <div className="relative mt-1">
                  <Phone className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="manual-phone"
                    placeholder="e.g. +1 650 555 9999"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="manual-company" className="text-xs">
                  Company / Title (Optional)
                </Label>
                <div className="relative mt-1">
                  <Building className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="manual-company"
                    placeholder="e.g. Lucky Shrub"
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="manual-email" className="text-xs">
                  Email (Optional)
                </Label>
                <div className="relative mt-1">
                  <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="manual-email"
                    placeholder="e.g. barbara@example.com"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendManualContact}
                disabled={
                  !manualName.trim() || !manualPhone.trim() || submitting
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Contact Card'
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
