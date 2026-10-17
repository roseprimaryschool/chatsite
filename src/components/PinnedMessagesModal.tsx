import React, { useState, useEffect } from 'react';
import { X, Pin, PinOff, Calendar } from 'lucide-react';
import type { Message } from '../types';
import { api } from '../lib/api';
import { useChat } from '../context/ChatContext';

interface PinnedMessagesModalProps {
  channelId: string;
  channelName: string;
  onClose: () => void;
}

export function PinnedMessagesModal({ channelId, channelName, onClose }: PinnedMessagesModalProps) {
  const { togglePin, setActiveLightboxUrl } = useChat();
  const [pinnedList, setPinnedList] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPins() {
      try {
        setLoading(true);
        const res = await api.fetchChannelPins(channelId);
        setPinnedList(res.pinned);
      } catch (err) {
        console.error('Failed to load pinned messages:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPins();
  }, [channelId]);

  const handleUnpin = (messageId: string) => {
    togglePin(messageId);
    setPinnedList((prev) => prev.filter((m) => m.id !== messageId));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0d1117]/60">
          <div className="flex items-center gap-2.5">
            <Pin className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              Pinned Messages in #{channelName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Loading pins...</div>
          ) : pinnedList.length === 0 ? (
            <div className="py-12 text-center">
              <Pin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">No pinned messages yet</p>
              <p className="text-xs text-slate-500 mt-1">Important announcements and pins will appear here.</p>
            </div>
          ) : (
            pinnedList.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-xl bg-[#0d1117] border border-white/5 space-y-2 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={msg.sender?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-xs font-semibold text-white">
                      {msg.sender?.display_name || 'Member'}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {new Date(msg.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <button
                    onClick={() => handleUnpin(msg.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded transition-colors"
                    title="Unpin message"
                  >
                    <PinOff className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {msg.image_url && (
                  <img
                    src={msg.image_url}
                    alt="Pinned attachment"
                    loading="lazy"
                    onClick={() => setActiveLightboxUrl(msg.image_url)}
                    className="max-h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity border border-white/10 bg-[#1e1f22]"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
