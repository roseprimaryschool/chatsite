import React, { useState, useEffect } from 'react';
import {
  Hash,
  Plus,
  MessageSquare,
  MessagesSquare,
  ShieldAlert,
  Settings,
  Mic,
  MicOff,
  Headphones,
  Circle,
  Wifi,
  WifiOff,
  LogOut,
  Volume2,
  PhoneOff,
  Compass,
  Users,
  Search,
  Lock,
  ChevronDown,
  X,
} from 'lucide-react';
import type { Channel, User, UserStatus, VoiceChannel } from '../types';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { api } from '../lib/api';

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenCreateChannel: () => void;
  onOpenAdmin: () => void;
  onSelectUser: (user: User) => void;
}

export function Sidebar({
  onOpenSettings,
  onOpenCreateChannel,
  onOpenAdmin,
  onSelectUser,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const {
    channels,
    voiceChannels,
    currentChannel,
    currentDmUser,
    currentVoiceChannel,
    voiceUsers,
    isVoiceConnected,
    isVoiceMuted,
    isVoiceDeafened,
    isSpeaking,
    selectChannel,
    selectDm,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleVoiceMute,
    toggleVoiceDeafen,
    isConnected,
    updateUserStatus,
    onlineUsers,
  } = useChat();

  // Navigation mode: 'server' or 'dms'
  const [activeNav, setActiveNav] = useState<'server' | 'dms'>(
    currentDmUser ? 'dms' : 'server'
  );

  const [dmThreads, setDmThreads] = useState<any[]>([]);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<UserStatus>('online');

  // Sync activeNav with currentDmUser
  useEffect(() => {
    if (currentDmUser) {
      setActiveNav('dms');
    }
  }, [currentDmUser]);

  // Load DM threads
  useEffect(() => {
    async function loadDms() {
      try {
        const res = await api.fetchDmThreads();
        setDmThreads(res.threads);
      } catch {
        // Ignore failure
      }
    }
    loadDms();
  }, [currentDmUser]);

  const handleStatusChange = (status: UserStatus) => {
    setCurrentStatus(status);
    updateUserStatus(status);
    setShowStatusPicker(false);
  };

  const handleSwitchToDms = () => {
    setActiveNav('dms');
    // If we have previous DM threads and no current DM user, select the first thread
    if (!currentDmUser && dmThreads.length > 0 && dmThreads[0].counterpart) {
      selectDm(dmThreads[0].counterpart);
    }
  };

  const handleSwitchToServer = () => {
    setActiveNav('server');
    if (!currentChannel && channels.length > 0) {
      const defaultChan = channels.find((c) => c.name === 'general-chat') || channels[0];
      selectChannel(defaultChan);
    }
  };

  const handleDirectSignOut = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isAdminOrMod = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <div className="flex h-full shrink-0 select-none">
      {/* ============================================================== */}
      {/* 1. FAR-LEFT GUILD BAR (DISCORD SERVER STRIP - 72px)            */}
      {/* ============================================================== */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 border-r border-[#111214] z-20 shrink-0">
        {/* Direct Messages Icon */}
        <div className="relative group flex items-center justify-center w-full">
          {/* Active / Hover Left Pill Indicator */}
          <span
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
              activeNav === 'dms'
                ? 'h-10 opacity-100'
                : 'h-2 opacity-0 group-hover:h-5 group-hover:opacity-100'
            }`}
          />

          <button
            onClick={handleSwitchToDms}
            className={`w-12 h-12 flex items-center justify-center transition-all duration-200 ${
              activeNav === 'dms'
                ? 'bg-[#5865F2] text-white rounded-[16px] shadow-lg shadow-[#5865F2]/30'
                : 'bg-[#313338] text-[#dbdee1] rounded-3xl hover:rounded-[16px] hover:bg-[#5865F2] hover:text-white'
            }`}
            title="Direct Messages"
          >
            <MessagesSquare className="w-6 h-6" />
          </button>
        </div>

        {/* Server Divider Line */}
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full my-1" />

        {/* PulseChat Server Icon */}
        <div className="relative group flex items-center justify-center w-full">
          {/* Active / Hover Left Pill Indicator */}
          <span
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
              activeNav === 'server'
                ? 'h-10 opacity-100'
                : 'h-2 opacity-0 group-hover:h-5 group-hover:opacity-100'
            }`}
          />

          <button
            onClick={handleSwitchToServer}
            className={`w-12 h-12 flex items-center justify-center font-black text-lg transition-all duration-200 ${
              activeNav === 'server'
                ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-[16px] shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/30'
                : 'bg-[#313338] text-[#dbdee1] rounded-3xl hover:rounded-[16px] hover:bg-indigo-600 hover:text-white'
            }`}
            title="PulseChat Server"
          >
            P
          </button>
        </div>

        {/* Add Server Button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={onOpenCreateChannel}
            className="w-12 h-12 flex items-center justify-center bg-[#313338] text-[#23a55a] rounded-3xl hover:rounded-[16px] hover:bg-[#23a55a] hover:text-white transition-all duration-200"
            title="Create Channel / Topic"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Moderator Shield Icon (if Admin/Mod) */}
        {isAdminOrMod && (
          <div className="relative group flex items-center justify-center w-full">
            <button
              onClick={onOpenAdmin}
              className="w-12 h-12 flex items-center justify-center bg-[#313338] text-amber-400 rounded-3xl hover:rounded-[16px] hover:bg-amber-500 hover:text-white transition-all duration-200"
              title="Moderation Console & Reports"
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Live WebSocket Status Dot at bottom */}
        <div className="mt-auto flex flex-col items-center gap-1.5 pb-1">
          <div
            className={`w-3 h-3 rounded-full border-2 border-[#1e1f22] ${
              isConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'
            }`}
            title={isConnected ? 'Connected to PulseChat Real-Time Network' : 'Reconnecting to server...'}
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. SUB-SIDEBAR (CHANNELS OR DIRECT MESSAGES - 240px)            */}
      {/* ============================================================== */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col h-full border-r border-[#1f2023] shrink-0">
        {/* Header Bar depending on activeNav */}
        {activeNav === 'server' ? (
          /* Server Header */
          <div className="relative">
            <button
              onClick={() => setShowServerMenu(!showServerMenu)}
              className="w-full h-12 px-4 border-b border-[#1f2023] flex items-center justify-between hover:bg-[#35373c]/60 transition-colors shadow-sm text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm text-white tracking-wide truncate">
                  PulseChat
                </span>
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center font-bold shrink-0">
                  ✓
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-[#949ba4] shrink-0" />
            </button>

            {/* Server Dropdown Menu */}
            {showServerMenu && (
              <div className="absolute top-13 left-2 right-2 p-1.5 bg-[#111214] border border-[#1f2023] rounded-lg shadow-2xl z-30 space-y-0.5 animate-in fade-in">
                <button
                  onClick={() => {
                    setShowServerMenu(false);
                    onOpenCreateChannel();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-[#949ba4] hover:text-white hover:bg-[#5865F2] rounded transition-colors text-left font-medium"
                >
                  <span>Create Channel</span>
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {isAdminOrMod && (
                  <button
                    onClick={() => {
                      setShowServerMenu(false);
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-amber-400 hover:text-white hover:bg-amber-600 rounded transition-colors text-left font-medium"
                  >
                    <span>Moderation Console</span>
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowServerMenu(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-[#949ba4] hover:text-white hover:bg-[#5865F2] rounded transition-colors text-left font-medium"
                >
                  <span>Server Settings</span>
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Direct Messages Header */
          <div className="h-12 px-3 border-b border-[#1f2023] flex items-center shadow-sm">
            <button
              onClick={() => {
                if (onlineUsers.length > 0) {
                  const target = onlineUsers.find((u) => u.id !== user?.id) || onlineUsers[0];
                  if (target) selectDm(target);
                }
              }}
              className="w-full h-7 px-2 bg-[#1e1f22] text-[#949ba4] hover:text-[#dbdee1] rounded text-xs flex items-center justify-between transition-colors font-medium"
            >
              <span className="truncate">Find or start a conversation</span>
              <Search className="w-3.5 h-3.5 text-[#949ba4]" />
            </button>
          </div>
        )}

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {activeNav === 'server' ? (
            /* ======================================================== */
            /* SERVER VIEW: TEXT CHANNELS & VOICE CHANNELS ONLY         */
            /* (Direct messages only show when clicking the DM button!) */
            /* ======================================================== */
            <>
              {/* Text Channels Category */}
              <div>
                <div className="flex items-center justify-between px-2 mb-1 text-[#949ba4] text-[11px] font-bold uppercase tracking-wider group">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-white">
                    <ChevronDown className="w-3 h-3 text-[#949ba4]" />
                    Text Channels
                  </span>
                  <button
                    onClick={onOpenCreateChannel}
                    className="p-0.5 hover:text-white transition-colors"
                    title="Create Channel"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-0.5">
                  {channels.map((chan) => {
                    const isActive = currentChannel?.id === chan.id;
                    const isRulesChan =
                      chan.id === 'chan_rules' ||
                      chan.name.toLowerCase().includes('rule') ||
                      chan.name.toLowerCase().includes('welcome');

                    return (
                      <button
                        key={chan.id}
                        onClick={() => selectChannel(chan)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-colors text-left group ${
                          isActive
                            ? 'bg-[#35373c] text-white font-semibold'
                            : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]/50'
                        }`}
                      >
                        {isRulesChan ? (
                          <Lock
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-amber-400' : 'text-[#80848e] group-hover:text-amber-400/80'
                            }`}
                          />
                        ) : (
                          <Hash
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#dbdee1]' : 'text-[#80848e] group-hover:text-[#dbdee1]'
                            }`}
                          />
                        )}
                        <span className="truncate flex-1">{chan.name}</span>
                        {isRulesChan && (
                          <span className="text-[10px] text-amber-400/70 uppercase font-mono px-1 rounded bg-amber-950/40 border border-amber-900/40">
                            rules
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voice Channels Category */}
              <div>
                <div className="flex items-center justify-between px-2 mb-1 text-[#949ba4] text-[11px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-white">
                    <ChevronDown className="w-3 h-3 text-[#949ba4]" />
                    Voice Channels
                  </span>
                </div>

                <div className="space-y-1">
                  {voiceChannels.map((vc) => {
                    const isJoined = currentVoiceChannel?.id === vc.id;
                    const occupants = isJoined ? voiceUsers : vc.activeUsers || [];

                    return (
                      <div key={vc.id} className="space-y-0.5">
                        <button
                          onClick={() => joinVoiceChannel(vc)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors text-left group ${
                            isJoined
                              ? 'bg-emerald-950/50 border border-emerald-800/40 text-emerald-300 font-semibold'
                              : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Volume2
                              className={`w-4 h-4 shrink-0 ${
                                isJoined ? 'text-emerald-400' : 'text-[#80848e] group-hover:text-[#dbdee1]'
                              }`}
                            />
                            <span className="truncate">{vc.name}</span>
                          </div>

                          {occupants.length > 0 && (
                            <span className="text-[10px] text-emerald-400/90 font-mono bg-[#1e1f22] px-1.5 py-0.5 rounded">
                              {occupants.length}
                            </span>
                          )}
                        </button>

                        {/* Connected Occupants inside this Voice Channel */}
                        {occupants.length > 0 && (
                          <div className="pl-6 space-y-1 py-1">
                            {occupants.map((vu) => (
                              <div
                                key={vu.user.id}
                                className="flex items-center justify-between text-xs text-slate-300 pr-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="relative shrink-0">
                                    <img
                                      src={vu.user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                                      alt=""
                                      className={`w-5 h-5 rounded-full object-cover transition-all ${
                                        vu.isSpeaking
                                          ? 'ring-2 ring-emerald-400 scale-105 shadow-md shadow-emerald-500/40'
                                          : 'border border-white/10'
                                      }`}
                                    />
                                  </div>
                                  <span
                                    className={`truncate text-[11px] ${
                                      vu.isSpeaking ? 'text-emerald-300 font-semibold' : 'text-[#dbdee1]'
                                    }`}
                                  >
                                    {vu.user.display_name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 text-[#80848e]">
                                  {vu.isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
                                  {vu.isDeafened && <Headphones className="w-3 h-3 text-rose-400" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* ======================================================== */
            /* DIRECT MESSAGES VIEW: FRIENDS TAB & ACTIVE DM CONVERSATIONS*/
            /* ======================================================== */
            <>
              {/* Friends Tab */}
              <button
                onClick={() => {
                  // Switch to Friends directory
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                  !currentDmUser
                    ? 'bg-[#35373c] text-white font-semibold'
                    : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]/50'
                }`}
              >
                <Users className="w-4 h-4 text-[#80848e]" />
                <span className="flex-1 font-semibold">Friends</span>
                {onlineUsers.length > 0 && (
                  <span className="text-[10px] bg-[#1e1f22] text-[#949ba4] font-mono px-1.5 py-0.5 rounded">
                    {onlineUsers.length}
                  </span>
                )}
              </button>

              {/* Direct Messages Category Header */}
              <div className="pt-2">
                <div className="flex items-center justify-between px-2 mb-1.5 text-[#949ba4] text-[11px] font-bold uppercase tracking-wider">
                  <span>Direct Messages</span>
                  <button
                    onClick={() => {
                      if (onlineUsers.length > 0) {
                        const other = onlineUsers.find((u) => u.id !== user?.id) || onlineUsers[0];
                        if (other) selectDm(other);
                      }
                    }}
                    className="p-0.5 hover:text-white transition-colors"
                    title="Start Direct Message"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-0.5">
                  {dmThreads.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-xs text-[#949ba4] mb-2 font-medium">No direct messages yet</p>
                      <p className="text-[11px] text-[#80848e]">
                        Click on any member in the server to start a private conversation.
                      </p>
                    </div>
                  ) : (
                    dmThreads.map((thread) => {
                      const counterpart: User = thread.counterpart;
                      if (!counterpart) return null;
                      const isActive = currentDmUser?.id === counterpart.id;

                      return (
                        <div
                          key={counterpart.id}
                          className={`group w-full flex items-center justify-between px-2 py-1.5 rounded transition-colors text-left cursor-pointer ${
                            isActive
                              ? 'bg-[#35373c] text-white font-semibold'
                              : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]/50'
                          }`}
                          onClick={() => selectDm(counterpart)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                              <img
                                src={counterpart.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover bg-[#1e1f22]"
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#2b2d31] ${
                                  counterpart.status === 'idle'
                                    ? 'bg-amber-500'
                                    : counterpart.status === 'dnd'
                                    ? 'bg-rose-500'
                                    : counterpart.status === 'offline'
                                    ? 'bg-slate-500'
                                    : 'bg-emerald-500'
                                }`}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate text-white">
                                {counterpart.display_name}
                              </p>
                              <p className="text-[10px] text-[#80848e] truncate">
                                {counterpart.custom_status || `@${counterpart.username}`}
                              </p>
                            </div>
                          </div>

                          {/* Close DM button on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDmThreads((prev) => prev.filter((t) => t.counterpart?.id !== counterpart.id));
                              if (currentDmUser?.id === counterpart.id) {
                                handleSwitchToServer();
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-white rounded transition-opacity"
                            title="Close DM"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* VOICE CONNECTED STATUS BOX (WHEN JOINED TO VOICE)              */}
        {/* ============================================================== */}
        {isVoiceConnected && currentVoiceChannel && (
          <div className="p-2.5 bg-[#11251d] border-t border-emerald-900/40 border-b border-[#1f2023] flex items-center justify-between animate-in fade-in">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Voice Connected</span>
              </div>
              <p className="text-[11px] text-[#949ba4] truncate">
                {currentVoiceChannel.name} / RTC Active
              </p>
            </div>

            <div className="flex items-center gap-1 text-[#dbdee1]">
              <button
                onClick={toggleVoiceMute}
                className={`p-1.5 rounded transition-colors ${
                  isVoiceMuted ? 'text-rose-400 bg-rose-950/50' : 'hover:bg-white/10'
                }`}
                title={isVoiceMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleVoiceDeafen}
                className={`p-1.5 rounded transition-colors ${
                  isVoiceDeafened ? 'text-rose-400 bg-rose-950/50' : 'hover:bg-white/10'
                }`}
                title={isVoiceDeafened ? 'Undeafen' : 'Deafen Audio'}
              >
                <Headphones className="w-4 h-4" />
              </button>

              <button
                onClick={leaveVoiceChannel}
                className="p-1.5 rounded text-rose-400 hover:text-white hover:bg-rose-600 transition-colors ml-0.5"
                title="Disconnect Voice"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* USER FOOTER PANEL (ANCHORED AT BOTTOM OF SUB-SIDEBAR)          */}
        {/* ============================================================== */}
        <div className="p-1.5 bg-[#232428] border-t border-[#1f2023] relative">
          {/* Status Dropdown Picker */}
          {showStatusPicker && (
            <div className="absolute bottom-16 left-2 right-2 p-2 bg-[#111214] border border-[#1f2023] rounded-lg shadow-2xl space-y-1 z-30 animate-in fade-in">
              <span className="text-[10px] uppercase font-bold text-[#949ba4] px-2 py-1 block">
                Set Online Status
              </span>
              <button
                onClick={() => handleStatusChange('online')}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[#dbdee1] hover:bg-[#35373c] rounded transition-colors"
              >
                <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                <span>Online</span>
              </button>
              <button
                onClick={() => handleStatusChange('idle')}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[#dbdee1] hover:bg-[#35373c] rounded transition-colors"
              >
                <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                <span>Idle</span>
              </button>
              <button
                onClick={() => handleStatusChange('dnd')}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[#dbdee1] hover:bg-[#35373c] rounded transition-colors"
              >
                <Circle className="w-2.5 h-2.5 fill-rose-500 text-rose-500" />
                <span>Do Not Disturb</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* User Info Tile */}
            <button
              onClick={() => user && onSelectUser(user)}
              className="flex items-center gap-2 p-1 rounded hover:bg-[#35373c] transition-colors min-w-0 flex-1 text-left mr-1"
            >
              <div className="relative shrink-0">
                <img
                  src={user?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                  alt=""
                  className={`w-8 h-8 rounded-full object-cover bg-[#1e1f22] transition-all ${
                    isSpeaking ? 'ring-2 ring-emerald-400' : ''
                  }`}
                />
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusPicker(!showStatusPicker);
                  }}
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#232428] cursor-pointer ${
                    currentStatus === 'online'
                      ? 'bg-emerald-500'
                      : currentStatus === 'idle'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  title="Change status"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {user?.display_name}
                </p>
                <p className="text-[10px] text-[#949ba4] truncate leading-tight">
                  @{user?.username}
                </p>
              </div>
            </button>

            {/* Quick Audio, Settings & Working Sign Out Controls */}
            <div className="flex items-center gap-0.5 text-[#949ba4]">
              <button
                onClick={toggleVoiceMute}
                className={`p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors ${
                  isVoiceMuted ? 'text-rose-400' : ''
                }`}
                title={isVoiceMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleVoiceDeafen}
                className={`p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors ${
                  isVoiceDeafened ? 'text-rose-400' : ''
                }`}
                title={isVoiceDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
              >
                <Headphones className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenSettings}
                className="p-1.5 rounded hover:text-white hover:bg-[#35373c] transition-colors"
                title="User Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Working Sign Out Button */}
              <button
                onClick={() => setShowLogoutConfirm(!showLogoutConfirm)}
                className="p-1.5 rounded hover:text-rose-400 hover:bg-rose-950/40 text-[#949ba4] transition-colors"
                title="Log Out of PulseChat"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Logout Confirmation Popover */}
          {showLogoutConfirm && (
            <div className="absolute bottom-16 right-2 p-3 bg-[#111214] border border-[#1f2023] rounded-lg shadow-2xl space-y-2.5 z-30 max-w-[210px] animate-in fade-in">
              <p className="text-xs text-white font-medium">Log out of PulseChat?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDirectSignOut}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors shadow-sm"
                >
                  Log Out
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-2.5 py-1.5 text-xs text-[#949ba4] hover:text-white rounded hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
