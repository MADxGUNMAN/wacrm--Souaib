"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Loader2, Edit3, Eye, EyeOff, ImagePlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { updateLandingSection } from "./actions";
import { createClient } from "@/lib/supabase/client";

const SECTION_FIELD_CONFIG: Record<string, {
  title?: boolean;
  subtitle?: boolean;
  badge_text?: boolean;
  body_text?: boolean;
  cta_primary?: boolean;
  cta_secondary?: boolean;
  image?: boolean;
  multiple_images?: boolean;
  two_image_rows?: boolean;
  features_list?: boolean;
  steps_list?: boolean;
  integrations_list?: boolean;
  pricing_list?: boolean;
  testimonials_list?: boolean;
  faqs_list?: boolean;
}> = {
  hero: { badge_text: true, subtitle: true, body_text: true, cta_primary: true, cta_secondary: true, image: true },
  social_proof: { multiple_images: true, two_image_rows: true },
  features: { subtitle: true, features_list: true },
  how_it_works: { subtitle: true, steps_list: true },
  ai_highlight: { subtitle: true, image: true, cta_primary: true },
  integrations: { subtitle: true, integrations_list: true },
  pricing: { subtitle: true, pricing_list: true },
  testimonials: { testimonials_list: true },
  faq: { subtitle: true, faqs_list: true },
  cta_banner: { subtitle: true, body_text: true, cta_primary: true, cta_secondary: true },
};

// Using any to skip full type generation for this specific client wrapper,
// since it perfectly matches the supabase row type.
export function SectionsClient({ initialSections }: { initialSections: any[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const supabase = createClient();

  const handleEditClick = (section: any) => {
    // Clone to avoid accidental mutations before save
    setEditingSection({ ...section });
  };

  const handleToggleVisibility = async (id: string, currentVisible: boolean) => {
    try {
      const res = await updateLandingSection(id, { is_visible: !currentVisible });
      if (!res.error) {
        setSections(sections.map(s => s.id === id ? { ...s, is_visible: !currentVisible } : s));
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSection) return;
    
    setIsSaving(true);
    try {
      const res = await updateLandingSection(editingSection.id, {
        title: editingSection.title,
        subtitle: editingSection.subtitle,
        body_text: editingSection.body_text,
        cta_primary_text: editingSection.cta_primary_text,
        cta_primary_link: editingSection.cta_primary_link,
        cta_secondary_text: editingSection.cta_secondary_text,
        cta_secondary_link: editingSection.cta_secondary_link,
        image_url: editingSection.image_url,
        images: editingSection.images || [],
        images_secondary: editingSection.images_secondary || [],
        is_visible: editingSection.is_visible,
      });

      if (res.error) {
        alert("Failed to update section: " + res.error);
      } else {
        // Update local state
        setSections(sections.map(s => s.id === editingSection.id ? editingSection : s));
        setEditingSection(null);
        router.refresh();
      }
    } catch (err) {
      alert("An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const currentConfig = editingSection ? (SECTION_FIELD_CONFIG[editingSection.section_key] || {
    subtitle: true,
    body_text: true,
    cta_primary: true,
    cta_secondary: true,
    image: true
  }) : null;

  if (editingSection && currentConfig) {
    return (
      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" type="button" onClick={() => setEditingSection(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Edit Section: {editingSection.section_key}</h2>
              <p className="text-sm text-slate-500 mt-1">Modify the content and behavior of this section.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setEditingSection(null)}>Cancel</Button>
            <Button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input 
                value={editingSection.title || ""}
                onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })}
                required
              />
            </div>
            {currentConfig.badge_text && (
              <div className="space-y-2">
                <Label>Badge Text</Label>
                <Input 
                  value={editingSection.extra_data?.badge_text ?? ""}
                  onChange={(e) => {
                    setEditingSection({ 
                      ...editingSection, 
                      extra_data: { 
                        ...(editingSection.extra_data || {}), 
                        badge_text: e.target.value 
                      } 
                    })
                  }}
                  placeholder="e.g. Official WhatsApp Business API"
                />
              </div>
            )}
            {currentConfig.subtitle && (
              <div className="space-y-2">
                <Label>Subtitle</Label>
                <Textarea 
                  value={editingSection.subtitle || ""}
                  onChange={(e) => setEditingSection({ ...editingSection, subtitle: e.target.value })}
                  rows={3}
                />
              </div>
            )}
            {currentConfig.body_text && (
              <div className="space-y-2">
                <Label>{editingSection.section_key === 'hero' ? 'Trusted By Text' : 'Body Text'}</Label>
                <Textarea 
                  value={editingSection.body_text || ""}
                  onChange={(e) => setEditingSection({ ...editingSection, body_text: e.target.value })}
                  rows={editingSection.section_key === 'hero' ? 2 : 5}
                  placeholder={editingSection.section_key === 'hero' ? "e.g. Trusted by 10,000+ teams globally" : ""}
                />
              </div>
            )}
            
            {currentConfig.cta_primary && (
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">Call to Action (Primary)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Button Text</Label>
                    <Input 
                      value={editingSection.cta_primary_text || ""}
                      onChange={(e) => setEditingSection({ ...editingSection, cta_primary_text: e.target.value })}
                      placeholder="e.g. Get Started"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Button Link</Label>
                    <Input 
                      value={editingSection.cta_primary_link || ""}
                      onChange={(e) => setEditingSection({ ...editingSection, cta_primary_link: e.target.value })}
                      placeholder="e.g. /signup"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentConfig.cta_secondary && (
              <div className="pt-4 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Call to Action (Secondary)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Button Text</Label>
                  <Input 
                    value={editingSection.cta_secondary_text || ""}
                    onChange={(e) => setEditingSection({ ...editingSection, cta_secondary_text: e.target.value })}
                    placeholder="e.g. View Documentation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Button Link</Label>
                  <Input 
                    value={editingSection.cta_secondary_link || ""}
                    onChange={(e) => setEditingSection({ ...editingSection, cta_secondary_link: e.target.value })}
                    placeholder="e.g. /docs"
                  />
                </div>
              </div>
            </div>
            )}

            {currentConfig.image && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Media (Image)</h4>
              <div className="mt-1 border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50/50 group hover:bg-slate-50 transition-colors">
                {editingSection.image_url ? (
                  <div className="relative w-full aspect-video rounded-md overflow-hidden bg-slate-100 mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editingSection.image_url} alt="Section Image" className="object-contain w-full h-full" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform">
                    <ImagePlus className="h-5 w-5 text-white" />
                  </div>
                )}
                
                <div className="flex w-full items-center gap-2">
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploading(true);
                      try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${Math.random()}.${fileExt}`;
                        const filePath = `landing-sections/${fileName}`;
                        
                        const { error: uploadError, data } = await supabase.storage
                          .from('public-assets')
                          .upload(filePath, file);
                          
                        if (uploadError) throw uploadError;
                        
                        const { data: { publicUrl } } = supabase.storage
                          .from('public-assets')
                          .getPublicUrl(filePath);
                          
                        setEditingSection({ ...editingSection, image_url: publicUrl });
                      } catch (err: any) {
                        alert("Error uploading image: " + err.message);
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                    disabled={isUploading}
                    className="flex-1"
                  />
                  {isUploading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
                </div>
                
                <p className="text-xs text-slate-400 mt-3 text-center">
                  Upload an image to override the default graphic for this section.
                </p>
                
                {editingSection.image_url && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="mt-4 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => setEditingSection({ ...editingSection, image_url: null })}
                  >
                    Remove Image
                  </Button>
                )}
              </div>
            </div>
            )}

            {currentConfig.multiple_images && (
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">{currentConfig.two_image_rows ? "Media (Row 1 - Left to Right)" : "Media (Multiple Images)"}</h4>
                <div className="space-y-4">
                  {editingSection.images && editingSection.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {editingSection.images.map((url: string, index: number) => (
                        <div key={index} className="relative group rounded-md border border-slate-200 overflow-hidden bg-slate-50 aspect-video flex items-center justify-center p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Image ${index + 1}`} className="object-contain w-full h-full" />
                          <button
                            type="button"
                            onClick={() => {
                              const newImages = [...editingSection.images];
                              newImages.splice(index, 1);
                              setEditingSection({ ...editingSection, images: newImages });
                            }}
                            className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50/50">
                    <div className="flex w-full items-center gap-2">
                      <Input 
                        type="file" 
                        accept="image/*" 
                        multiple
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files || files.length === 0) return;
                          setIsUploading(true);
                          try {
                            const uploadPromises = Array.from(files).map(async (file) => {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${Math.random()}.${fileExt}`;
                              const filePath = `landing-sections/${fileName}`;
                              
                              const { error: uploadError } = await supabase.storage
                                .from('public-assets')
                                .upload(filePath, file);
                                
                              if (uploadError) throw uploadError;
                              
                              const { data: { publicUrl } } = supabase.storage
                                .from('public-assets')
                                .getPublicUrl(filePath);
                                
                              return publicUrl;
                            });
                            
                            const newUrls = await Promise.all(uploadPromises);
                            const currentImages = editingSection.images || [];
                            setEditingSection({ ...editingSection, images: [...currentImages, ...newUrls] });
                          } catch (err: any) {
                            alert("Error uploading images: " + err.message);
                          } finally {
                            setIsUploading(false);
                          }
                        }}
                        disabled={isUploading}
                        className="flex-1"
                      />
                      {isUploading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 text-center">
                      Upload an image to add it to the carousel/gallery.
                    </p>
                  </div>
                </div>

                {currentConfig.two_image_rows && (
                  <div className="mt-8 pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-semibold text-slate-900 mb-4">Media (Row 2 - Right to Left)</h4>
                    <div className="space-y-4">
                      {editingSection.images_secondary && editingSection.images_secondary.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {editingSection.images_secondary.map((url: string, index: number) => (
                            <div key={index} className="relative group rounded-md border border-slate-200 overflow-hidden bg-slate-50 aspect-video flex items-center justify-center p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Image ${index + 1}`} className="object-contain w-full h-full" />
                              <button
                                type="button"
                                onClick={() => {
                                  const newImages = [...editingSection.images_secondary];
                                  newImages.splice(index, 1);
                                  setEditingSection({ ...editingSection, images_secondary: newImages });
                                }}
                                className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50/50">
                        <div className="flex w-full items-center gap-2">
                          <Input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files || files.length === 0) return;
                              setIsUploading(true);
                              try {
                                const uploadPromises = Array.from(files).map(async (file) => {
                                  const fileExt = file.name.split('.').pop();
                                  const fileName = `${Math.random()}.${fileExt}`;
                                  const filePath = `landing-sections/${fileName}`;
                                  
                                  const { error: uploadError } = await supabase.storage
                                    .from('public-assets')
                                    .upload(filePath, file);
                                    
                                  if (uploadError) throw uploadError;
                                  
                                  const { data: { publicUrl } } = supabase.storage
                                    .from('public-assets')
                                    .getPublicUrl(filePath);
                                    
                                  return publicUrl;
                                });
                                
                                const newUrls = await Promise.all(uploadPromises);
                                const currentImages = editingSection.images_secondary || [];
                                setEditingSection({ ...editingSection, images_secondary: [...currentImages, ...newUrls] });
                              } catch (err: any) {
                                alert("Error uploading images: " + err.message);
                              } finally {
                                setIsUploading(false);
                              }
                            }}
                            disabled={isUploading}
                            className="flex-1"
                          />
                          {isUploading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-400 mt-3 text-center">
                          Upload an image to add it to the secondary carousel row.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {currentConfig.features_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">Feature Cards</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentFeatures = editingSection.extra_data?.features || [];
                      const newFeatures = [...currentFeatures, { id: crypto.randomUUID(), title: "New Feature", description: "Description here", icon_name: "Star" }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), features: newFeatures } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Feature
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.features || []).map((feature: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          const currentFeatures = editingSection.extra_data?.features || [];
                          const newFeatures = currentFeatures.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), features: newFeatures } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={feature.title}
                            className="bg-white"
                            onChange={(e) => {
                              const currentFeatures = [...(editingSection.extra_data?.features || [])];
                              currentFeatures[index].title = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), features: currentFeatures } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Icon Name (Lucide)</Label>
                          <Input
                            value={feature.icon_name}
                            className="bg-white"
                            onChange={(e) => {
                              const currentFeatures = [...(editingSection.extra_data?.features || [])];
                              currentFeatures[index].icon_name = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), features: currentFeatures } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            value={feature.description}
                            rows={2}
                            className="bg-white"
                            onChange={(e) => {
                              const currentFeatures = [...(editingSection.extra_data?.features || [])];
                              currentFeatures[index].description = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), features: currentFeatures } });
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.features || editingSection.extra_data.features.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No features added yet. Click &quot;Add Feature&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentConfig.steps_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">How It Works Steps</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentSteps = editingSection.extra_data?.steps || [];
                      const newSteps = [...currentSteps, { id: crypto.randomUUID(), title: "New Step", description: "Description here", icon_name: "Star" }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), steps: newSteps } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Step
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.steps || []).map((step: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          const currentSteps = editingSection.extra_data?.steps || [];
                          const newSteps = currentSteps.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), steps: newSteps } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={step.title}
                            className="bg-white"
                            onChange={(e) => {
                              const currentSteps = [...(editingSection.extra_data?.steps || [])];
                              currentSteps[index].title = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), steps: currentSteps } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Icon Name (Lucide)</Label>
                          <Input
                            value={step.icon_name}
                            className="bg-white"
                            onChange={(e) => {
                              const currentSteps = [...(editingSection.extra_data?.steps || [])];
                              currentSteps[index].icon_name = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), steps: currentSteps } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            value={step.description}
                            rows={2}
                            className="bg-white"
                            onChange={(e) => {
                              const currentSteps = [...(editingSection.extra_data?.steps || [])];
                              currentSteps[index].description = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), steps: currentSteps } });
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.steps || editingSection.extra_data.steps.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No steps added yet. Click &quot;Add Step&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentConfig.integrations_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">Integrations</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentIntegrations = editingSection.extra_data?.integrations || [];
                      const newIntegrations = [...currentIntegrations, { id: crypto.randomUUID(), title: "New Integration", description: "Description here", icon_name: "Link2" }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), integrations: newIntegrations } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Integration
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.integrations || []).map((integration: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          const currentIntegrations = editingSection.extra_data?.integrations || [];
                          const newIntegrations = currentIntegrations.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), integrations: newIntegrations } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={integration.title}
                            className="bg-white"
                            onChange={(e) => {
                              const currentIntegrations = [...(editingSection.extra_data?.integrations || [])];
                              currentIntegrations[index].title = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), integrations: currentIntegrations } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Icon Name (Lucide)</Label>
                          <Input
                            value={integration.icon_name}
                            className="bg-white"
                            onChange={(e) => {
                              const currentIntegrations = [...(editingSection.extra_data?.integrations || [])];
                              currentIntegrations[index].icon_name = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), integrations: currentIntegrations } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            value={integration.description}
                            rows={2}
                            className="bg-white"
                            onChange={(e) => {
                              const currentIntegrations = [...(editingSection.extra_data?.integrations || [])];
                              currentIntegrations[index].description = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), integrations: currentIntegrations } });
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.integrations || editingSection.extra_data.integrations.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No integrations added yet. Click &quot;Add Integration&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentConfig.pricing_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">Pricing Tiers</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentTiers = editingSection.extra_data?.tiers || [];
                      const newTiers = [...currentTiers, { 
                        id: crypto.randomUUID(), 
                        name: "New Tier", 
                        description: "Tier description",
                        price_monthly: "$99",
                        price_subtitle: "per month",
                        cta_text: "Get Started",
                        cta_link: "/signup",
                        is_highlighted: false,
                        highlight_label: "Most Popular",
                        features: "Feature 1\nFeature 2"
                      }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), tiers: newTiers } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Tier
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.tiers || []).map((tier: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 z-10"
                        onClick={() => {
                          const currentTiers = editingSection.extra_data?.tiers || [];
                          const newTiers = currentTiers.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), tiers: newTiers } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Tier Name</Label>
                          <Input
                            value={tier.name}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].name = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Price (e.g., $79 or Custom)</Label>
                          <Input
                            value={tier.price_monthly}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].price_monthly = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={tier.description}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].description = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Price Subtitle (e.g. per month)</Label>
                          <Input
                            value={tier.price_subtitle}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].price_subtitle = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Highlight Label</Label>
                          <Input
                            value={tier.highlight_label}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].highlight_label = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Button Text</Label>
                          <Input
                            value={tier.cta_text}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].cta_text = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Button Link</Label>
                          <Input
                            value={tier.cta_link}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].cta_link = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Features (One per line)</Label>
                          <Textarea
                            value={tier.features}
                            rows={4}
                            className="bg-white"
                            onChange={(e) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].features = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                        </div>
                        <div className="flex items-center space-x-2 pt-2 md:col-span-2">
                          <Switch
                            checked={tier.is_highlighted}
                            onCheckedChange={(checked) => {
                              const currentTiers = [...(editingSection.extra_data?.tiers || [])];
                              currentTiers[index].is_highlighted = checked;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), tiers: currentTiers } });
                            }}
                          />
                          <Label className="text-xs">Highlight this tier (e.g. Most Popular)</Label>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.tiers || editingSection.extra_data.tiers.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No pricing tiers added yet. Click &quot;Add Tier&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentConfig.testimonials_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">Testimonials</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentList = editingSection.extra_data?.testimonials || [];
                      const newList = [...currentList, { 
                        id: crypto.randomUUID(), 
                        author_name: "John Doe", 
                        author_role: "CEO", 
                        rating: 5,
                        quote: "Amazing platform, highly recommended!" 
                      }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), testimonials: newList } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Testimonial
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.testimonials || []).map((t: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 z-10"
                        onClick={() => {
                          const currentList = editingSection.extra_data?.testimonials || [];
                          const newList = currentList.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), testimonials: newList } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Author Name</Label>
                          <Input
                            value={t.author_name}
                            className="bg-white"
                            onChange={(e) => {
                              const currentList = [...(editingSection.extra_data?.testimonials || [])];
                              currentList[index].author_name = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), testimonials: currentList } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Author Role / Company</Label>
                          <Input
                            value={t.author_role}
                            className="bg-white"
                            onChange={(e) => {
                              const currentList = [...(editingSection.extra_data?.testimonials || [])];
                              currentList[index].author_role = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), testimonials: currentList } });
                            }}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs">Quote</Label>
                          <Textarea
                            value={t.quote}
                            rows={3}
                            className="bg-white"
                            onChange={(e) => {
                              const currentList = [...(editingSection.extra_data?.testimonials || [])];
                              currentList[index].quote = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), testimonials: currentList } });
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.testimonials || editingSection.extra_data.testimonials.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No testimonials added yet. Click &quot;Add Testimonial&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentConfig.faqs_list && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-semibold text-slate-900">Frequently Asked Questions</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentList = editingSection.extra_data?.faqs || [];
                      const newList = [...currentList, { 
                        id: crypto.randomUUID(), 
                        question: "What is your question?", 
                        answer: "Provide the answer here."
                      }];
                      setEditingSection({ 
                        ...editingSection, 
                        extra_data: { ...(editingSection.extra_data || {}), faqs: newList } 
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add FAQ
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(editingSection.extra_data?.faqs || []).map((faq: any, index: number) => (
                    <Card key={index} className="p-5 relative bg-slate-50/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 z-10"
                        onClick={() => {
                          const currentList = editingSection.extra_data?.faqs || [];
                          const newList = currentList.filter((_: any, i: number) => i !== index);
                          setEditingSection({ 
                            ...editingSection, 
                            extra_data: { ...(editingSection.extra_data || {}), faqs: newList } 
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-1 gap-4 mr-10">
                        <div className="space-y-2">
                          <Label className="text-xs">Question</Label>
                          <Input
                            value={faq.question}
                            className="bg-white font-medium"
                            onChange={(e) => {
                              const currentList = [...(editingSection.extra_data?.faqs || [])];
                              currentList[index].question = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), faqs: currentList } });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Answer</Label>
                          <Textarea
                            value={faq.answer}
                            rows={3}
                            className="bg-white"
                            onChange={(e) => {
                              const currentList = [...(editingSection.extra_data?.faqs || [])];
                              currentList[index].answer = e.target.value;
                              setEditingSection({ ...editingSection, extra_data: { ...(editingSection.extra_data || {}), faqs: currentList } });
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!editingSection.extra_data?.faqs || editingSection.extra_data.faqs.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                      No FAQs added yet. Click &quot;Add FAQ&quot; to create one.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <Label className="font-semibold text-slate-900">Visibility</Label>
                <p className="text-sm text-slate-500">Show or hide this section on the public site.</p>
              </div>
              <div className="flex border rounded-md overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setEditingSection({ ...editingSection, is_visible: false })}
                  className={`px-6 py-1.5 text-sm font-medium transition-colors ${!editingSection.is_visible ? "bg-rose-50 text-rose-600 border-r" : "text-slate-500 hover:bg-slate-50 border-r"}`}
                >
                  HIDDEN
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSection({ ...editingSection, is_visible: true })}
                  className={`px-6 py-1.5 text-sm font-medium transition-colors ${editingSection.is_visible ? "bg-emerald-50 text-emerald-600" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  VISIBLE
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" type="button" onClick={() => router.push("/super-admin/cms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Landing Sections</h2>
          <p className="text-sm text-slate-500 mt-1">Manage the content blocks on your public homepage.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sections.map((section) => (
          <Card key={section.id} className={`flex flex-col ${!section.is_visible ? 'opacity-60 bg-slate-50' : ''}`}>
            <CardHeader className="pb-3 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base font-mono text-emerald-600 mb-1">{section.section_key}</CardTitle>
                  <CardDescription className="line-clamp-1">{section.title}</CardDescription>
                </div>
                {section.is_visible ? (
                  <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Visible
                  </span>
                ) : (
                  <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Hidden
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1">
              <p className="text-sm text-slate-600 line-clamp-3 mb-4">
                {section.subtitle || "No subtitle provided."}
              </p>
              
              <div className="flex gap-2 text-xs text-slate-400 mb-6">
                {section.cta_primary_text && <span className="bg-slate-100 px-2 py-1 rounded">Has Primary CTA</span>}
                {section.cta_secondary_text && <span className="bg-slate-100 px-2 py-1 rounded">Has Secondary CTA</span>}
              </div>
            </CardContent>
            <div className="p-4 pt-0 mt-auto flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => handleEditClick(section)}>
                <Edit3 className="w-4 h-4 mr-2" /> Edit Section
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => handleToggleVisibility(section.id, !!section.is_visible)}
                title={section.is_visible ? "Hide section" : "Show section"}
              >
                {section.is_visible ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
