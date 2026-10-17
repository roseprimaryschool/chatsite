import React, { useState, useEffect } from 'react';
import { ShieldCheck, Circle, Users, Sparkles } from 'lucide-react';
import type { User } from '../types';
import { useChat } from '../context/ChatContext';
import { api } from '../lib/api';

interface MembersListProps {
  onSelectUser: (user: User) => void;
}

export function MembersList({ onSelectUser }: MembersListProps) {
  const { onlineUsers } = useChat();
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await api.fetchUsers();
        setAllUsers(res.users);
      } catch (err) {
        console.error('Failed to fetch members:', err);
      }
    }
    fetchUsers();
  }, []);

  // Merge registered users with active real-time status from onlineUsers
  const onlineMap = new Map(onlineUsers.map((u) => [u.id, u]));

  const membersWithPresence: User[] = allUsers.map((u) => {
    const live = onlineMap.get(u.id);
    return {
      ...u,
      status: live ? live.status || 'online' : 'offline',
      custom_status: live?.custom_status || u.custom_status,
    };
  });

  const admins = membersWithPresence.filter((u) => u.role === 'admin' || u.role === 'moderator');
  const onlineMembers = membersWithPresence.filter(
    (u) => u.role !== 'admin' && u.role !== 'moderator' && u.status !== 'offline'
  );
  const offlineMembers = membersWithPresence.filter(
    (u) => u.role !== 'admin' && u.role !== 'moderator' && u.status === 'offline'
  );

  const renderUserItem = (u: User) => {
    const statusColor =
      u.status === 'online'
        ? 'bg-emerald-500'
        : u.status === 'idle'
        ? 'bg-amber-500'
        : u.status === 'dnd'
        ? 'bg-rose-500'
        : 'bg-slate-600';

    return (
      <button
        key={u.id}
        onClick={() => onSelectUser(u)}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#21262d] transition-colors text-left group"
      >
        <div className="relative shrink-0">
          <img
            src={u.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
            alt=""
            className="w-8 h-8 rounded-full object-cover bg-[#0d1117] border border-white/5"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#161b22] ${statusColor}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
              {u.display_name}
            </span>
            {u.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {u.role === 'moderator' && <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </div>
          {u.custom_status ? (
            <p className="text-[11px] text-slate-400 truncate">{u.custom_status}</p>
          ) : (
            <p className="text-[11px] text-slate-500 truncate">@{u.username}</p>
          )}
        </div>
      </button>
    );
  };

  return (
    <aside className="w-60 bg-[#161b22] border-l border-white/5 h-full flex flex-col p-3 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 py-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
        <Users className="w-4 h-4 text-indigo-400" />
        <span>Members ({membersWithPresence.length})</span>
      </div>

      <div className="space-y-4">
        {/* Leadership & Staff */}
        {admins.length > 0 && (
          <div>
            <span className="px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Staff & Bots — {admins.length}
            </span>
            <div className="space-y-0.5">{admins.map(renderUserItem)}</div>
          </div>
        )}

        {/* Online Members */}
        {onlineMembers.length > 0 && (
          <div>
            <span className="px-2 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
              Online — {onlineMembers.length}
            </span>
            <div className="space-y-0.5">{onlineMembers.map(renderUserItem)}</div>
          </div>
        )}

        {/* Offline Members */}
        {offlineMembers.length > 0 && (
          <div>
            <span className="px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Offline — {offlineMembers.length}
            </span>
            <div className="space-y-0.5">{offlineMembers.map(renderUserItem)}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
