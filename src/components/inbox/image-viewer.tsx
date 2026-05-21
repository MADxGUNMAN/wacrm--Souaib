'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Download, Star, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  images: Message[];
  initialImageId: string;
  onClose: () => void;
}

export function ImageViewer({ images, initialImageId, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = images.findIndex((img) => img.id === initialImageId);
    return idx === -1 ? 0 : idx;
  });
  
  const [scale, setScale] = useState(1);

  const currentImage = images[currentIndex];
  const mediaUrl = currentImage?.media_url;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev));
    setScale(1);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
    setScale(1);
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));

  const handleDownload = async () => {
    if (!mediaUrl) return;
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const isVideo = currentImage.content_type === 'video';
      link.download = `media-${currentImage.id}.${isVideo ? 'mp4' : 'jpg'}`; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  if (!currentImage) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
      {/* Top Toolbar */}
      <div className="flex h-16 items-center justify-end px-4 gap-4 text-white/80">
        <button onClick={handleZoomIn} className="p-2 hover:text-white transition-colors rounded-full hover:bg-white/10">
          <ZoomIn className="h-5 w-5" />
        </button>
        <button onClick={handleZoomOut} className="p-2 hover:text-white transition-colors rounded-full hover:bg-white/10">
          <ZoomOut className="h-5 w-5" />
        </button>
        <button className="p-2 hover:text-white transition-colors rounded-full hover:bg-white/10" title="Star (Coming Soon)">
          <Star className="h-5 w-5" />
        </button>
        <button onClick={handleDownload} className="p-2 hover:text-white transition-colors rounded-full hover:bg-white/10" title="Download">
          <Download className="h-5 w-5" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-2" />
        <button onClick={onClose} className="p-2 hover:text-white transition-colors rounded-full hover:bg-white/10" title="Close">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main Image Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {currentIndex > 0 && (
          <button 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }} 
            className="absolute left-4 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}
        
        <div 
          className="w-full h-full flex items-center justify-center overflow-auto"
          onClick={onClose}
        >
          {currentImage.content_type === 'video' ? (
            <video 
              src={mediaUrl} 
              className="max-w-full max-h-full transition-transform duration-200"
              style={{ transform: `scale(${scale})` }}
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img 
              src={mediaUrl} 
              alt="Viewer" 
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${scale})` }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {currentIndex < images.length - 1 && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleNext(); }} 
            className="absolute right-4 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>

      {/* Bottom Carousel */}
      <div className="h-24 bg-black/50 border-t border-white/10 flex items-center justify-center gap-2 px-4 overflow-x-auto">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => {
              setCurrentIndex(idx);
              setScale(1);
            }}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all bg-slate-800",
              currentIndex === idx 
                ? "border-white opacity-100 scale-110 shadow-lg" 
                : "border-transparent opacity-50 hover:opacity-100"
            )}
          >
            {img.content_type === 'video' ? (
              <video 
                src={img.media_url || ''} 
                className="h-full w-full object-cover"
              />
            ) : (
              <img 
                src={img.media_url || ''} 
                alt={`Thumbnail ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
