import { Metadata } from 'next';
import {
  getSiteSettings,
  getContactPageSettings,
  getLegalPagesList,
} from '@/lib/cms/queries';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ContactSection } from '@/components/landing/ContactSection';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return {
    title: `Contact Us | ${settings?.site_name || 'Replai'}`,
    description: `Get in touch with the ${settings?.site_name || 'Replai'} team. We'd love to hear from you — reach out for support, partnerships, or general inquiries.`,
    openGraph: {
      title: `Contact Us | ${settings?.site_name || 'Replai'}`,
      description: `Contact the ${settings?.site_name || 'Replai'} team for support, partnerships, or questions about our AI-powered WhatsApp CRM.`,
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const [settings, contactSettings, legalPages] = await Promise.all([
    getSiteSettings(),
    getContactPageSettings(),
    getLegalPagesList(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden">
      <LandingNavbar
        siteName={settings?.site_name}
        logoUrl={settings?.logo_url}
        links={settings?.header_links}
      />

      <main>
        <ContactSection settings={contactSettings} siteName={settings?.site_name} />
      </main>

      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
