import React, { useState } from 'react';
import { X, Upload, Check, LogOut, Sparkles, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface SettingsModalProps {
  onClose: () => void;
}

const AVATAR_PRESETS = [
  { name: 'Cyber Pilot', url: '/src/assets/images/avatar_cyber_pilot_1792175128109.jpg' },
  { name: 'Creative Coder', url: '/src/assets/images/avatar_creative_coder_1792175128587.jpg' },
  { name: 'Neon Bot', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NeonBot&backgroundColor=6366f1' },
  { name: 'Emerald AI', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Emerald&backgroundColor=10b981' },
  { name: 'Solaris', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Solaris&backgroundColor=f59e0b' },
  { name: 'Pixel Spark', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Spark&backgroundColor=ec4899' },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, updateProfile, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError('File size must be below 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const uploadRes = await api.uploadImage(base64, file.name);
        setAvatarUrl(uploadRes.url);
      } catch (err: any) {
        setError(err.message || 'Image upload failed.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl,
        bio,
        custom_status: customStatus,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile settings.');
    } finally {
      setSaving(false);
    }
  };

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      onClose();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0d1117]/60">
          <div className="flex items-center gap-2.5">
            <UserIcon className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">User Settings & Profile</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Profile updated successfully!</span>
            </div>
          )}

          {/* Avatar Preview & Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Avatar
            </label>
            <div className="flex items-center gap-4 mb-3">
              <img
                src={avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                alt="Avatar preview"
                className="w-16 h-16 rounded-xl border-2 border-indigo-500/50 bg-[#0d1117] object-cover"
              />
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-slate-200 text-xs font-medium rounded-lg border border-white/10 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Custom Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-slate-400">JPG, PNG, GIF, or WebP up to 8MB</span>
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" /> Choose from high-fidelity avatars:
              </span>
              <div className="grid grid-cols-6 gap-2">
                {AVATAR_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setAvatarUrl(p.url)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all p-0.5 ${
                      avatarUrl === p.url ? 'border-indigo-500 scale-105' : 'border-transparent hover:border-white/30'
                    }`}
                    title={p.name}
                  >
                    <img src={p.url} alt={p.name} className="w-full aspect-square object-cover rounded-md bg-[#0d1117]" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-3.5 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Your public name"
            />
          </div>

          {/* Custom Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Custom Status
            </label>
            <input
              type="text"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              className="w-full px-3.5 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g. Coding in React ⚡ or Exploring..."
              maxLength={80}
            />
          </div>

          {/* About Me Bio */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              About Me (Bio)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              placeholder="Write a few words about yourself, interests, or stack..."
              maxLength={300}
            />
          </div>

          {/* Account Details Box */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-white/5 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Username:</span>
              <span className="text-slate-200 font-mono">@{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span>Email:</span>
              <span className="text-slate-200">{user?.email || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>Role:</span>
              <span className="text-indigo-400 font-semibold capitalize">{user?.role}</span>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#0d1117]/60 flex items-center justify-between">
          {confirmLogout ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-300 font-medium">Log out now?</span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {loggingOut ? 'Signing out...' : 'Yes, Sign Out'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#21262d] hover:bg-[#30363d] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
