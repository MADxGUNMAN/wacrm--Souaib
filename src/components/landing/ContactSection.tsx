'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ContactPageSettings } from '@/types/super-admin';

interface ContactSectionProps {
  settings: ContactPageSettings | null;
  siteName?: string;
}

export function ContactSection({ settings, siteName = 'Replai' }: ContactSectionProps) {
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
    name: '',
    email: '',
    phone: '',
    company: '',
    subject: '',
    message: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error('Please agree to the Terms and Privacy Policy before submitting.');
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
      setForm({ name: '', email: '', phone: '', company: '', subject: '', message: '' });
      setAgreed(false);
      toast.success('Message sent successfully!');
    } catch (err) {
      setStatus('idle');
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(msg);
    }
  };

  return (
    <section className="relative pt-24 pb-16 lg:pt-24 lg:pb-16 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white to-white pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(37,211,102,0.06)_0%,transparent_70%)] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(59,130,246,0.04)_0%,transparent_70%)] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        {/* ─── 2-Column Layout ─── */}
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-start">

          {/* ─── Left Column: Info ─── */}
          <div className="lg:sticky lg:top-32">
            <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-black tracking-tight leading-[1.1] mb-5">
              <span className="bg-gradient-to-r from-slate-900 via-slate-700 to-[#25D366] bg-clip-text text-transparent">
                {heading}
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-500 leading-relaxed mb-8 max-w-md">
              {subheading}
            </p>

            {/* Contact details — vertical list */}
            <div className="space-y-6">
              {contactInfoItems.map((item, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="shrink-0 w-11 h-11 rounded-full bg-slate-100 group-hover:bg-[#25D366]/10 flex items-center justify-center transition-colors duration-300">
                    <item.icon className="w-5 h-5 text-slate-400 group-hover:text-[#25D366] transition-colors duration-300" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-0.5">
                      {item.label}
                    </p>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-sm text-slate-500 hover:text-[#25D366] transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-[#25D366]"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">
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
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.03)] p-6 md:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">{formHeading}</h2>
                <p className="text-sm text-slate-400">{formSubheading}</p>
              </div>

              {status === 'success' ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-8 h-8 text-[#25D366]" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Message Sent!
                  </h3>
                  <p className="text-slate-500 mb-6 max-w-sm">
                    Thank you for reaching out. We&apos;ll get back to you within 24 hours.
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
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Row 1: Full Name + Email */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Full Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Rahul Sharma"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Email Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="rahul@example.com"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all"
                      />
                    </div>
                  </div>

                  {/* Row 2: WhatsApp / Phone Number */}
                  <div>
                    <label htmlFor="contact-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                      WhatsApp / Phone Number
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91 88394 64025"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all"
                    />
                  </div>

                  {/* Row 3: Company / Business Name */}
                  <div>
                    <label htmlFor="contact-company" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Company / Business Name
                    </label>
                    <input
                      id="contact-company"
                      type="text"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Your company name"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all"
                    />
                  </div>

                  {/* Row 4: How can we help? */}
                  <div>
                    <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700 mb-1.5">
                      How can we help? <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="contact-message"
                      required
                      rows={4}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us about your question, billing concern, support request, or WhatsApp automation requirement..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all resize-none"
                    />
                  </div>

                  {/* Row 5: Agreement checkbox */}
                  <div className="flex items-start gap-3">
                    <input
                      id="contact-agree"
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#25D366] focus:ring-[#25D366]/30 cursor-pointer accent-[#25D366]"
                    />
                    <label htmlFor="contact-agree" className="text-sm text-slate-500 cursor-pointer leading-snug">
                      I agree to {siteName}&apos;s{' '}
                      <Link href="/legal/terms-of-service" className="text-slate-700 font-medium underline underline-offset-2 hover:text-[#25D366] transition-colors">
                        Terms
                      </Link>{' '}
                      and{' '}
                      <Link href="/legal/privacy-policy" className="text-slate-700 font-medium underline underline-offset-2 hover:text-[#25D366] transition-colors">
                        Privacy Policy
                      </Link>.
                    </label>
                  </div>



                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                  >
                    {status === 'loading' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
