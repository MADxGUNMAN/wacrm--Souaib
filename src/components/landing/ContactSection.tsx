'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ContactPageSettings } from '@/types/super-admin';

interface ContactSectionProps {
  settings: ContactPageSettings | null;
  siteName?: string;
  initialName?: string;
  initialEmail?: string;
  isAuthenticated?: boolean;
}

export function ContactSection({
  settings,
  siteName = 'Replai',
  initialName = '',
  initialEmail = '',
  isAuthenticated = false,
}: ContactSectionProps) {
  const heading = settings?.heading || 'Get in Touch';
  const subheading =
    settings?.subheading ||
    'Reach out for product support, billing questions, or WhatsApp automation help.';
  const formHeading = settings?.form_heading || 'Send us a message';
  const formSubheading =
    settings?.form_subheading || 'We usually respond within 24 business hours.';

  const contactInfoItems = [
    {
      icon: MapPin,
      label: 'Registered Business Address',
      value: settings?.office_address || 'Mumbai, Maharashtra, India',
    },
    {
      icon: Phone,
      label: 'Business Phone Number',
      value: settings?.phone_number || '+91 8828891029',
      href: `tel:${settings?.phone_number?.replace(/\s/g, '') || '+918828891029'}`,
    },
    {
      icon: Mail,
      label: 'Customer Support Email',
      value: settings?.email_address || 'info@junkiescoder.com',
      href: `mailto:${settings?.email_address || 'info@junkiescoder.com'}`,
    },
    {
      icon: Clock,
      label: 'Working Hours',
      value: settings?.working_hours || 'Mon to Fri, 10:00 AM to 7:00 PM IST',
    },
  ];

  // Form state
  const [form, setForm] = useState({
    name: initialName,
    email: initialEmail,
    phone: '',
    company: '',
    subject: '',
    message: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error(
        'Please agree to the Terms and Privacy Policy before submitting.'
      );
      return;
    }
    setStatus('loading');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
      setForm({
        name: '',
        email: '',
        phone: '',
        company: '',
        subject: '',
        message: '',
      });
      setAgreed(false);
      toast.success('Message sent successfully!');
    } catch (err) {
      setStatus('idle');
      const msg =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      toast.error(msg);
    }
  };

  return (
    <section
      className={`relative flex min-h-screen flex-1 flex-col justify-center overflow-hidden pb-16 lg:pb-20 ${
        isAuthenticated ? 'pt-8 sm:pt-12 lg:pt-14' : 'pt-28 sm:pt-30 lg:pt-32'
      }`}
    >
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white to-white" />
      <div className="pointer-events-none absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.06)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.04)_0%,transparent_70%)]" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6">
        {/* ─── 2-Column Layout ─── */}
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ─── Left Column: Info ─── */}
          <div className="lg:sticky lg:top-28">
            <h1 className="mb-4 text-3xl leading-[1.15] font-black tracking-tight sm:text-4xl lg:text-5xl">
              <span className="bg-gradient-to-r from-slate-900 via-slate-700 to-[#25D366] bg-clip-text text-transparent">
                {heading}
              </span>
            </h1>

            <p className="mb-6 max-w-md text-sm leading-relaxed text-slate-500 sm:text-base">
              {subheading}
            </p>

            {/* Contact details — vertical list */}
            <div className="space-y-4">
              {contactInfoItems.map((item, i) => (
                <div key={i} className="group flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-colors duration-300 group-hover:bg-[#25D366]/10">
                    <item.icon className="h-5 w-5 text-slate-400 transition-colors duration-300 group-hover:text-[#25D366]" />
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs font-bold tracking-wider text-slate-900 uppercase">
                      {item.label}
                    </p>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-sm text-slate-500 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-[#25D366] hover:decoration-[#25D366]"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-line text-slate-500">
                        {item.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Right Column: Form ─── */}
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {formHeading}
              </h2>
              <p className="text-xs text-slate-400 sm:text-sm">
                {formSubheading}
              </p>
            </div>

            {status === 'success' ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366]/10">
                  <CheckCircle2 className="h-7 w-7 text-[#25D366]" />
                </div>
                <h3 className="mb-1 text-lg font-bold text-slate-900">
                  Message Sent!
                </h3>
                <p className="mb-4 max-w-sm text-sm text-slate-500">
                  Thank you for reaching out. We&apos;ll get back to you within
                  24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="text-sm font-medium text-[#25D366] hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Row 1: Full Name + Email */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm"
                    >
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Rahul Sharma"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-email"
                      className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm"
                    >
                      Email Address <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="rahul@example.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Row 2: WhatsApp / Phone Number */}
                <div>
                  <label
                    htmlFor="contact-phone"
                    className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm"
                  >
                    WhatsApp / Phone Number
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="+91 88394 64025"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                  />
                </div>

                {/* Row 3: Company / Business Name */}
                <div>
                  <label
                    htmlFor="contact-company"
                    className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm"
                  >
                    Company / Business Name
                  </label>
                  <input
                    id="contact-company"
                    type="text"
                    value={form.company}
                    onChange={(e) =>
                      setForm({ ...form, company: e.target.value })
                    }
                    placeholder="Your company name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                  />
                </div>

                {/* Row 4: How can we help? */}
                <div>
                  <label
                    htmlFor="contact-message"
                    className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm"
                  >
                    How can we help? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={3}
                    value={form.message}
                    onChange={(e) =>
                      setForm({ ...form, message: e.target.value })
                    }
                    placeholder="Tell us about your question, billing concern, support request, or WhatsApp automation requirement..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                  />
                </div>

                {/* Row 5: Agreement checkbox */}
                <div className="flex items-start gap-2.5 pt-0.5">
                  <input
                    id="contact-agree"
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-[#25D366] accent-[#25D366] focus:ring-[#25D366]/30"
                  />
                  <label
                    htmlFor="contact-agree"
                    className="cursor-pointer text-xs leading-snug text-slate-500 sm:text-sm"
                  >
                    I agree to {siteName}&apos;s{' '}
                    <Link
                      href="/legal/terms-of-service"
                      className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-[#25D366]"
                    >
                      Terms
                    </Link>{' '}
                    and{' '}
                    <Link
                      href="/legal/privacy-policy"
                      className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-[#25D366]"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
