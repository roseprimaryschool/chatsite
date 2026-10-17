import React, { useState, useRef, useEffect } from 'react';
import {
  Hash,
  Search,
  Pin,
  Users,
  Paperclip,
  Smile,
  Send,
  X,
  Edit2,
  Trash2,
  Reply,
  Flag,
  Check,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  Lock,
  MicOff,
  RefreshCw,
} from 'lucide-react';
import type { Message, User } from '../types';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { api } from '../lib/api';

interface ChatAreaProps {
  onOpenSearch: () => void;
  onOpenPins: () => void;
  onToggleMembers: () => void;
  showMembers: boolean;
  onSelectUser: (user: User) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '🎉', '👀', '💯'];
const POPULAR_GIFS = [
  { name: 'Cheering High Five', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { name: 'Mind Blown', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { name: 'Celebration Confetti', url: 'https://media.giphy.com/media/3KC2jD2Q38OSMQhyNg/giphy.gif' },
  { name: 'Intense Coding', url: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif' },
  { name: 'Welcome Wave', url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif' },
  { name: 'Popcorn Enjoyment', url: 'https://media.giphy.com/media/t3cL1iXeWH8fSS45mb/giphy.gif' },
];

export function ChatArea({
  onOpenSearch,
  onOpenPins,
  onToggleMembers,
  showMembers,
  onSelectUser,
}: ChatAreaProps) {
  const { user } = useAuth();
  const {
    currentChannel,
    currentDmUser,
    currentVoiceChannel,
    voiceUsers,
    leaveVoiceChannel,
    isVoiceMuted,
    toggleVoiceMute,
    messages,
    loadingMessages,
    typingUsers,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    sendTyping,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    setActiveLightboxUrl,
    onlineUsers,
    selectDm,
  } = useChat();

  const [inputContent, setInputContent] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [reportModalMessage, setReportModalMessage] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('Spam or inappropriate language');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<any>(null);

  const handleImageError = (msgId: string) => {
    setFailedImages((prev) => new Set(prev).add(msgId));
  };

  const handleRetryImage = (msgId: string) => {
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.delete(msgId);
      return next;
    });
  };

  // Auto-fill edit content when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setInputContent(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  const isRulesChannel = Boolean(
    currentChannel &&
      (currentChannel.id === 'chan_rules' ||
        currentChannel.name.toLowerCase().includes('rule') ||
        currentChannel.name.toLowerCase().includes('welcome'))
  );
  const canPostInCurrentChannel = !isRulesChannel || user?.role === 'admin' || user?.role === 'moderator';

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [currentChannel, currentDmUser]);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length]);

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value);

    // Send typing broadcast
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  // Image Upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image file must be under 8MB.');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await api.uploadImage(base64, file.name);
        setAttachedImage(res.url);
      } catch (err: any) {
        setUploadError(err.message || 'Image upload failed. Please try again.');
      } finally {
        setUploadingImage(false);
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read image file.');
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputContent.trim();

    if (!content && !attachedImage) return;

    try {
      if (editingMessage) {
        editMessage(editingMessage.id, content);
        setEditingMessage(null);
        setInputContent('');
      } else {
        await sendMessage(content, attachedImage || undefined, replyingTo?.id);
        setInputContent('');
        setAttachedImage(null);
        setReplyingTo(null);
      }
      sendTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Escape') {
      if (editingMessage) {
        setEditingMessage(null);
        setInputContent('');
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    }
  };

  const handleSendReport = async () => {
    if (!reportModalMessage) return;
    try {
      await api.reportMessage(reportModalMessage.id, reportReason);
      setReportModalMessage(null);
      alert('Report submitted to moderators. Thank you for keeping PulseChat safe.');
    } catch (err: any) {
      alert(err.message || 'Report failed');
    }
  };

  const pinnedCount = messages.filter((m) => m.is_pinned === 1).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#313338] overflow-hidden relative">
      {/* Top Channel Header */}
      <header className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between bg-[#313338] shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          {currentChannel ? (
            <>
              {isRulesChannel ? (
                <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <Hash className="w-5 h-5 text-[#80848e] shrink-0" />
              )}
              <div className="min-w-0 flex items-center gap-2.5">
                <h2 className="text-sm font-bold text-white truncate">{currentChannel.name}</h2>
                {currentChannel.description && (
                  <>
                    <span className="text-[#4e5058] select-none">|</span>
                    <p className="text-xs text-[#949ba4] truncate font-normal">{currentChannel.description}</p>
                  </>
                )}
              </div>
            </>
          ) : currentDmUser ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#80848e] text-lg font-bold">@</span>
              <div className="min-w-0 flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate">{currentDmUser.display_name}</h2>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                {currentDmUser.custom_status && (
                  <>
                    <span className="text-[#4e5058] select-none">|</span>
                    <p className="text-xs text-[#949ba4] truncate font-normal">{currentDmUser.custom_status}</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Users className="w-5 h-5 text-[#80848e]" />
              <span>Friends & Direct Messages</span>
            </div>
          )}
        </div>

        {/* Header Action Icons */}
        <div className="flex items-center gap-1.5 text-[#b5bac1]">
          {currentChannel && (
            <button
              onClick={onOpenPins}
              className={`p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors relative ${
                pinnedCount > 0 ? 'text-amber-400' : ''
              }`}
              title="Pinned Messages"
            >
              <Pin className="w-4 h-4" />
              {pinnedCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          )}

          <button
            onClick={onOpenSearch}
            className="p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors"
            title="Search Messages"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMembers}
            className={`p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors ${
              showMembers ? 'text-[#5865F2] bg-[#35373c]' : ''
            }`}
            title="Toggle Member List"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Active Voice Stage Bar */}
      {currentVoiceChannel && (
        <div className="px-4 py-2.5 bg-[#161b22] border-b border-emerald-800/40 flex items-center justify-between text-xs animate-in fade-in shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Voice Room: {currentVoiceChannel.name}</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {voiceUsers.map((vu) => (
                <div
                  key={vu.user.id}
                  className={`relative rounded-full p-0.5 transition-all ${
                    vu.isSpeaking
                      ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#161b22]'
                      : 'border border-white/10'
                  }`}
                  title={`${vu.user.display_name}${vu.isSpeaking ? ' (Speaking)' : ''}${vu.isMuted ? ' (Muted)' : ''}`}
                >
                  <img
                    src={vu.user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                    alt={vu.user.display_name}
                    className="w-6 h-6 rounded-full object-cover bg-[#0d1117]"
                  />
                  {vu.isMuted && (
                    <span className="absolute -bottom-1 -right-1 bg-rose-600 rounded-full p-0.5 text-white">
                      <MicOff className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoiceMute}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                isVoiceMuted ? 'bg-rose-950/60 text-rose-300 border border-rose-800' : 'bg-[#21262d] text-slate-300 hover:text-white'
              }`}
            >
              {isVoiceMuted ? 'Unmute Mic' : 'Mute Mic'}
            </button>
            <button
              onClick={leaveVoiceChannel}
              className="px-2.5 py-1 bg-rose-600/30 text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-700/50 rounded-md text-xs font-semibold transition-colors"
            >
              Leave Voice
            </button>
          </div>
        </div>
      )}

      {/* Message List Pane */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loadingMessages ? (
          <div className="py-24 text-center text-slate-500 text-sm">Loading message history...</div>
        ) : messages.length === 0 ? (
          <div className="py-24 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto mb-3">
              <Hash className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Welcome to #{currentChannel?.name || currentDmUser?.display_name}!
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This is the start of the #{currentChannel?.name || 'conversation'} channel. Break the ice and send a message!
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = user?.id === msg.sender_id;
            const canDelete = isOwn || user?.role === 'admin' || user?.role === 'moderator';
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const isSameSender =
              prevMsg &&
              prevMsg.sender_id === msg.sender_id &&
              new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000;

            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`relative group rounded-xl p-2.5 transition-colors ${
                  msg.is_pinned ? 'bg-amber-950/20 border-l-2 border-amber-500' : 'hover:bg-[#161b22]/60'
                }`}
              >
                {/* Reply quote banner */}
                {msg.reply_to && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 pl-10 border-l-2 border-indigo-500/40">
                    <Reply className="w-3 h-3 text-indigo-400 rotate-180" />
                    <span className="font-semibold text-slate-300">@{msg.reply_to.sender_name}</span>
                    <span className="truncate italic text-slate-400">{msg.reply_to.content}</span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Sender Avatar */}
                  {!isSameSender ? (
                    <button
                      onClick={() => msg.sender && onSelectUser(msg.sender as any)}
                      className="shrink-0 hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={msg.sender?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                        alt=""
                        className="w-9 h-9 rounded-xl object-cover bg-[#161b22] border border-white/5 shadow-sm"
                      />
                    </button>
                  ) : (
                    <div className="w-9 shrink-0 text-center opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 tabular-nums pt-1">
                      {timeStr}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {!isSameSender && (
                      <div className="flex items-center gap-2 mb-0.5">
                        <button
                          onClick={() => msg.sender && onSelectUser(msg.sender as any)}
                          className="font-bold text-xs text-white hover:underline flex items-center gap-1.5"
                        >
                          {msg.sender?.display_name || 'Member'}
                          {msg.sender?.role === 'admin' && (
                            <span title="Admin">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          )}
                          {msg.sender?.role === 'moderator' && (
                            <span title="Moderator">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          )}
                        </button>
                        <span className="text-[11px] text-slate-500 tabular-nums">{timeStr}</span>
                        {msg.is_edited === 1 && (
                          <span className="text-[10px] text-slate-500 italic">(edited)</span>
                        )}
                        {msg.is_pinned === 1 && (
                          <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-0.5">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                      </div>
                    )}

                    {/* Message Text Content */}
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed break-words">
                      {msg.content}
                    </p>

                    {/* Transmitted Image Attachment */}
                    {msg.image_url && (
                      <div className="mt-2 inline-block">
                        {failedImages.has(msg.id) ? (
                          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#2b2d31] border border-white/10 max-w-sm">
                            <ImageIcon className="w-8 h-8 text-indigo-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-200">Image Attachment</p>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleRetryImage(msg.id)}
                                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 hover:underline"
                                >
                                  <RefreshCw className="w-3 h-3" /> Reload image
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveLightboxUrl(msg.image_url)}
                                  className="text-[11px] text-slate-400 hover:text-white"
                                >
                                  Open full view
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img
                            src={msg.image_url}
                            alt="Uploaded attachment"
                            onError={() => handleImageError(msg.id)}
                            onClick={() => setActiveLightboxUrl(msg.image_url)}
                            className="max-h-80 max-w-md rounded-xl object-cover border border-white/10 shadow-md cursor-pointer hover:opacity-95 transition-all bg-[#1e1f22]"
                            loading="lazy"
                          />
                        )}
                      </div>
                    )}

                    {/* Emoji Reactions Bar */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(msg.reactions).map(([emoji, data]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
                              data.hasReacted
                                ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200'
                                : 'bg-[#161b22] border-white/5 text-slate-400 hover:text-white hover:bg-[#21262d]'
                            }`}
                            title={data.users.join(', ')}
                          >
                            <span>{emoji}</span>
                            <span className="tabular-nums font-semibold">{data.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Floating Quick Action Toolbar on Hover */}
                <div className="absolute right-3 -top-3 hidden group-hover:flex items-center gap-0.5 bg-[#161b22] border border-white/10 rounded-lg p-1 shadow-xl z-10">
                  {/* Quick Reactions */}
                  {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(msg.id, emoji)}
                      className="p-1 hover:bg-white/10 rounded text-xs transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}

                  {/* Add Custom Reaction */}
                  <button
                    onClick={() =>
                      setActiveReactionMessageId(
                        activeReactionMessageId === msg.id ? null : msg.id
                      )
                    }
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Add reaction"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>

                  {/* Reply */}
                  <button
                    onClick={() => {
                      setReplyingTo(msg);
                      textareaRef.current?.focus();
                    }}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Reply"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>

                  {/* Pin Toggle */}
                  <button
                    onClick={() => togglePin(msg.id)}
                    className="p-1 text-slate-400 hover:text-amber-400 hover:bg-white/10 rounded transition-colors"
                    title={msg.is_pinned ? 'Unpin message' : 'Pin message'}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>

                  {/* Edit (if author) */}
                  {isOwn && (
                    <button
                      onClick={() => setEditingMessage(msg)}
                      className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-white/10 rounded transition-colors"
                      title="Edit message"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Report (if not author) */}
                  {!isOwn && (
                    <button
                      onClick={() => setReportModalMessage(msg)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                      title="Report message"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete (if author or admin) */}
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this message permanently?')) {
                          deleteMessage(msg.id);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Inline reaction picker popup */}
                {activeReactionMessageId === msg.id && (
                  <div className="absolute right-3 top-8 z-20 p-2 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl flex flex-wrap gap-1 max-w-[220px]">
                    {QUICK_EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          toggleReaction(msg.id, e);
                          setActiveReactionMessageId(null);
                        }}
                        className="p-1.5 hover:bg-white/10 rounded text-base transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicators Banner */}
      {typingUsers.length > 0 && (
        <div className="px-6 py-1 text-xs text-indigo-400 flex items-center gap-1.5 animate-pulse bg-[#0d1117]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span>
            {typingUsers.length === 1
              ? `${typingUsers[0].display_name} is typing...`
              : typingUsers.length === 2
              ? `${typingUsers[0].display_name} and ${typingUsers[1].display_name} are typing...`
              : 'Several members are typing...'}
          </span>
        </div>
      )}

      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-[#161b22] border-t border-indigo-500/30 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-semibold text-white">Replying to @{replyingTo.sender?.display_name}:</span>
            <span className="truncate text-slate-400 italic">"{replyingTo.content}"</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edit Banner */}
      {editingMessage && (
        <div className="px-4 py-2 bg-indigo-950/40 border-t border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Editing message — press Esc to cancel</span>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setInputContent('');
            }}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="px-4 py-2 bg-red-950/40 border-t border-red-500/30 flex items-center justify-between text-xs text-red-200">
          <span>{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attached Image Preview Before Sending */}
      {attachedImage && (
        <div className="px-4 py-2.5 bg-[#161b22] border-t border-white/5 flex items-center gap-3">
          <div className="relative inline-block">
            <img
              src={attachedImage}
              alt="Attachment preview"
              className="h-16 w-24 object-cover rounded-lg border border-white/10"
            />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 p-1 bg-black/80 hover:bg-red-600 text-white rounded-full transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <span className="text-xs text-slate-400">Image attached. Ready to send!</span>
        </div>
      )}

      {/* Main Message Input Box OR Read-Only Notice */}
      {!canPostInCurrentChannel ? (
        <div className="p-3.5 mx-4 mb-4 bg-[#2b2d31] border border-[#1f2023] rounded-lg flex items-center justify-center gap-2 text-xs text-[#949ba4] font-medium shadow-sm">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>You do not have permission to send messages in this channel. (Members cannot talk in #{currentChannel?.name})</span>
        </div>
      ) : (
        <div className="px-4 pb-4 bg-[#313338]">
          <div className="relative bg-[#383a40] rounded-lg transition-all shadow-inner focus-within:ring-1 focus-within:ring-[#5865F2]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputContent}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                currentChannel
                  ? `Message #${currentChannel.name}...`
                  : currentDmUser
                  ? `Message @${currentDmUser.display_name}...`
                  : 'Select a conversation...'
              }
              className="w-full bg-transparent px-4 py-2.5 text-sm text-[#dbdee1] focus:outline-none placeholder-[#80848e] resize-none max-h-32"
            />

            {/* Action Row Inside Input */}
            <div className="flex items-center justify-between px-3 pb-2 pt-0.5 text-[#b5bac1]">
              <div className="flex items-center gap-1">
                {/* File Attachment */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="p-1 hover:text-white hover:bg-white/5 rounded transition-colors"
                  title="Attach Image (up to 8MB)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* GIF Selector */}
                <button
                  type="button"
                  onClick={() => setShowGifPicker(!showGifPicker)}
                  className="px-2 py-0.5 text-xs font-bold hover:text-white hover:bg-white/5 rounded transition-colors text-[#b5bac1]"
                  title="Send a GIF"
                >
                  GIF
                </button>

                {/* Emoji Picker Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 hover:text-white hover:bg-white/5 rounded transition-colors"
                  title="Add Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              {/* Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputContent.trim() && !attachedImage}
                className="p-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded transition-colors disabled:opacity-40 disabled:hover:bg-[#5865F2] shadow-sm"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Emoji Selector Dropdown */}
        {showEmojiPicker && (
          <div className="absolute bottom-20 left-16 z-30 p-2.5 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl flex flex-wrap gap-1.5 max-w-xs animate-in fade-in">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setInputContent((prev) => prev + e);
                  setShowEmojiPicker(false);
                }}
                className="p-2 hover:bg-white/10 rounded-lg text-lg transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* GIF Selector Dropdown */}
        {showGifPicker && (
          <div className="absolute bottom-20 left-24 z-30 p-3 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-80 max-h-72 overflow-y-auto space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between pb-1 border-b border-white/5">
              <span className="text-xs font-bold text-slate-300">Popular GIFs</span>
              <button
                onClick={() => setShowGifPicker(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_GIFS.map((gif) => (
                <button
                  key={gif.name}
                  onClick={() => {
                    setAttachedImage(gif.url);
                    setShowGifPicker(false);
                  }}
                  className="rounded-lg overflow-hidden border border-white/5 hover:border-indigo-500 transition-colors group relative"
                >
                  <img src={gif.url} alt={gif.name} className="w-full h-24 object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-slate-200 py-0.5 px-1 truncate">
                    {gif.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Message Report Modal */}
      {reportModalMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setReportModalMessage(null)}
        >
          <div
            className="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-400">
              <Flag className="w-5 h-5" />
              <h3 className="text-base font-semibold text-white">Report Message</h3>
            </div>
            <p className="text-xs text-slate-400">
              Flag this message for administrator and moderator review:
            </p>

            <div className="p-3 bg-[#0d1117] rounded-lg border border-white/5 text-xs text-slate-300 italic">
              "{reportModalMessage.content}"
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Reason for reporting
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Spam or advertising">Spam or unwanted advertising</option>
                <option value="Harassment or offensive language">Harassment or abusive speech</option>
                <option value="Inappropriate image or link">Inappropriate image or link</option>
                <option value="Impersonation or misinformation">Impersonation or harmful content</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReportModalMessage(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-[#21262d] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReport}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
