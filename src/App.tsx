import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { MembersList } from './components/MembersList';
import { SettingsModal } from './components/SettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { UserProfileModal } from './components/UserProfileModal';
import { AdminPanel } from './components/AdminPanel';
import { PinnedMessagesModal } from './components/PinnedMessagesModal';
import { SearchModal } from './components/SearchModal';
import { LightboxModal } from './components/LightboxModal';
import type { User } from './types';

function MainApp() {
  const { user, loading } = useAuth();
  const { currentChannel, activeLightboxUrl, setActiveLightboxUrl } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Connecting to PulseChat...</p>
      </div>
    );
  }

  // Guest rule: Guests may only view the landing page
  if (!user) {
    return <LandingPage />;
  }

  return (
    <div className="h-screen w-screen flex bg-[#0d1117] text-[#e6edf3] overflow-hidden select-none">
      {/* PulseChat Left Navigation Sidebar */}
      <Sidebar
        onOpenSettings={() => setShowSettings(true)}
        onOpenCreateChannel={() => setShowCreateChannel(true)}
        onOpenAdmin={() => setShowAdmin(true)}
        onSelectUser={(u) => setSelectedUser(u)}
      />

      {/* Main Center Chatroom Area */}
      <main className="flex-1 flex overflow-hidden">
        <ChatArea
          onOpenSearch={() => setShowSearch(true)}
          onOpenPins={() => setShowPins(true)}
          onToggleMembers={() => setShowMembers(!showMembers)}
          showMembers={showMembers}
          onSelectUser={(u) => setSelectedUser(u)}
        />

        {/* Right Members Drawer */}
        {showMembers && <MembersList onSelectUser={(u) => setSelectedUser(u)} />}
      </main>

      {/* Modals & Overlays */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCreateChannel && <CreateChannelModal onClose={() => setShowCreateChannel(false)} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showPins && currentChannel && (
        <PinnedMessagesModal
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          onClose={() => setShowPins(false)}
        />
      )}
      {showSearch && (
        <SearchModal
          channelId={currentChannel?.id}
          channelName={currentChannel?.name}
          onClose={() => setShowSearch(false)}
        />
      )}
      {selectedUser && (
        <UserProfileModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
      {activeLightboxUrl && (
        <LightboxModal
          imageUrl={activeLightboxUrl}
          onClose={() => setActiveLightboxUrl(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <MainApp />
      </ChatProvider>
    </AuthProvider>
  );
}
