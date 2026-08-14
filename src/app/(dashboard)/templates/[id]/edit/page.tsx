import type { Metadata } from 'next';

import { TemplateEditLoader } from '@/components/templates/template-edit-loader';

export const metadata: Metadata = {
  title: 'Edit template',
};

export default async function EditTemplatePage({
  params,
}: PageProps<'/templates/[id]/edit'>) {
  // Next 16: route params arrive as a Promise.
  const { id } = await params;
  return <TemplateEditLoader id={id} />;
}
