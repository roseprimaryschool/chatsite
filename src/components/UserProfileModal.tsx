import React, { useState } from 'react';
import { X, MessageSquare, Ban, ShieldAlert, Check, Calendar, AlertTriangle, LogOut } from 'lucide-react';
import type { User } from '../types';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { api } from '../lib/api';

interface UserProfileModalProps {
  user: User | null;
  onClose: () => void;
}

export function UserProfileModal({ user, onClose }: UserProfileModalProps) {
  const { user: currentUser, logout } = useAuth();
  const { selectDm } = useChat();

  const [isBlocked, setIsBlocked] = useState(false);
  const [isBanned, setIsBanned] = useState(user?.is_banned === 1);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!user) return null;

  const isSelf = currentUser?.id === user.id;
  const canModerate = (currentUser?.role === 'admin' || currentUser?.role === 'moderator') && !isSelf;

  const handleStartDm = () => {
    selectDm(user);
    onClose();
  };

  const handleToggleBlock = async () => {
    try {
      setActionLoading(true);
      const res = await api.toggleBlockUser(user.id);
      setIsBlocked(res.isBlocked);
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Block action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBan = async () => {
    const confirmText = isBanned
      ? `Are you sure you want to unban ${user.display_name}?`
      : `Are you sure you want to ban ${user.display_name} from PulseChat? Their active sessions will terminate immediately.`;

    if (!window.confirm(confirmText)) return;

    try {
      setActionLoading(true);
      const res = await api.toggleBanUser(user.id, !isBanned);
      setIsBanned(res.banned);
      setActionSuccess(res.banned ? 'User banned from platform.' : 'User ban removed.');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Ban action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const joinedFormatted = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner header */}
        <div className="h-28 bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Card Body */}
        <div className="px-6 pb-6 pt-0 relative">
          {/* Avatar with status ring */}
          <div className="relative -mt-14 mb-4 inline-block">
            <img
              src={user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
              alt={user.display_name}
              className="w-24 h-24 rounded-2xl border-4 border-[#161b22] bg-[#0d1117] object-cover shadow-xl"
            />
            {user.status && (
              <span
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-[#161b22] ${
                  user.status === 'online'
                    ? 'bg-emerald-500'
                    : user.status === 'idle'
                    ? 'bg-amber-500'
                    : user.status === 'dnd'
                    ? 'bg-rose-500'
                    : 'bg-slate-500'
                }`}
                title={user.status}
              />
            )}
          </div>

          {/* User Name & Badges */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">{user.display_name}</h3>
                {user.role === 'admin' && (
                  <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                    Admin
                  </span>
                )}
                {user.role === 'moderator' && (
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                    Mod
                  </span>
                )}
                {isBanned && (
                  <span className="text-[11px] font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded">
                    Banned
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">@{user.username}</p>
            </div>
          </div>

          {/* Custom Status */}
          {user.custom_status && (
            <div className="mt-3 p-2.5 rounded-lg bg-[#0d1117] border border-white/5 text-xs text-slate-300">
              {user.custom_status}
            </div>
          )}

          {/* Bio */}
          <div className="mt-4">
            <h4 className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">About Me</h4>
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {user.bio || 'No bio provided yet.'}
            </p>
          </div>

          {/* Member since metadata */}
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Member since {joinedFormatted}</span>
          </div>

          {/* Action toast */}
          {actionSuccess && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Interactive Action Buttons */}
          {isSelf ? (
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={async () => {
                  onClose();
                  await logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of PulseChat</span>
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={handleStartDm}
                className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Direct Message</span>
              </button>

              <button
                onClick={handleToggleBlock}
                disabled={actionLoading}
                className={`px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                  isBlocked
                    ? 'bg-rose-950/40 border-rose-800 text-rose-300 hover:bg-rose-900/50'
                    : 'bg-[#0d1117] border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isBlocked ? 'Unblock' : 'Block'}</span>
              </button>

              {canModerate && (
                <button
                  onClick={handleToggleBan}
                  disabled={actionLoading}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    isBanned
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-700 hover:bg-rose-600 text-white'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{isBanned ? 'Lift Ban' : 'Ban User'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
