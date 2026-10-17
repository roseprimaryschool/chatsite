import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface LightboxModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function LightboxModal({ imageUrl, onClose }: LightboxModalProps) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top actions */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10 bg-black/60 backdrop-blur-md rounded-lg p-1.5 border border-white/10">
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Download original"
          >
            <Download className="w-4 h-4" />
          </a>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-red-500/20 hover:text-red-300 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image preview */}
        <img
          src={imageUrl}
          alt="Expanded attachment preview"
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10"
        />
      </div>
    </div>
  );
}
