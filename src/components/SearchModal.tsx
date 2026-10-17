import React, { useState, useEffect } from 'react';
import { X, Search, Hash, MessageSquare, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useChat } from '../context/ChatContext';

interface SearchModalProps {
  channelId?: string;
  channelName?: string;
  onClose: () => void;
}

export function SearchModal({ channelId, channelName, onClose }: SearchModalProps) {
  const { channels, selectChannel } = useChat();
  const [query, setQuery] = useState('');
  const [filterCurrentChannel, setFilterCurrentChannel] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.searchMessages(query.trim(), filterCurrentChannel ? channelId : undefined);
        setResults(res.results);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, filterCurrentChannel, channelId]);

  const handleSelectResult = (r: any) => {
    if (r.channel_id) {
      const targetChan = channels.find((c) => c.id === r.channel_id);
      if (targetChan) {
        selectChannel(targetChan);
      }
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header & input */}
        <div className="p-4 border-b border-white/10 bg-[#0d1117]/70 space-y-3">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-indigo-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages, links, keywords..."
              className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-slate-500"
            />
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {channelId && (
            <div className="flex items-center gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterCurrentChannel(!filterCurrentChannel)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  filterCurrentChannel
                    ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200'
                    : 'bg-[#21262d] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                Only in #{channelName}
              </button>
              <span className="text-slate-500">Press Esc to dismiss</span>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {searching ? (
            <div className="py-12 text-center text-slate-500 text-sm">Searching records...</div>
          ) : query.trim() && results.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No matching messages found</p>
              <p className="text-xs text-slate-500 mt-1">Try searching different keywords.</p>
            </div>
          ) : !query.trim() ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Type to begin searching across channel history and conversations.
            </div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                onClick={() => handleSelectResult(r)}
                className="p-3 rounded-xl bg-[#0d1117] hover:bg-[#21262d] border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <img
                      src={r.sender_avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span className="font-semibold text-slate-200 group-hover:text-white">
                      {r.sender_display_name}
                    </span>
                    {r.channel_name ? (
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-slate-500" />
                        {r.channel_name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <MessageSquare className="w-3 h-3 text-slate-500" />
                        Direct Message
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(r.created_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2 pl-7">{r.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
