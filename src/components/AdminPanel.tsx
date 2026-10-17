import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Check, Trash2, Ban, Eye, AlertOctagon } from 'lucide-react';
import type { ReportItem } from '../types';
import { api } from '../lib/api';
import { useChat } from '../context/ChatContext';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { deleteMessage } = useChat();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed' | 'all'>('pending');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const res = await api.fetchReports();
        setReports(res.reports);
      } catch (err) {
        console.error('Failed to load reports:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  const handleResolve = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await api.resolveReport(reportId, status);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      setActionNotice(`Report marked as ${status}.`);
      setTimeout(() => setActionNotice(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleDeleteMessage = async (report: ReportItem) => {
    if (window.confirm('Delete this reported message for all users?')) {
      deleteMessage(report.message_id);
      await handleResolve(report.id, 'resolved');
    }
  };

  const handleBanUser = async (report: any) => {
    if (!report.message_sender_id) return;
    if (window.confirm(`Ban user ${report.sender_name || 'author'} from PulseChat?`)) {
      await api.toggleBanUser(report.message_sender_id, true);
      await handleResolve(report.id, 'resolved');
      setActionNotice('Offending user was permanently banned.');
      setTimeout(() => setActionNotice(null), 2500);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0d1117]/70">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Moderation & Safety Center</h3>
              <p className="text-xs text-slate-400">Review flagged messages, enforce community rules, and manage bans</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-2.5 bg-[#0d1117]/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-[#161b22] rounded-lg border border-white/5 text-xs">
            {(['pending', 'resolved', 'dismissed', 'all'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                  filter === tab
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {actionNotice && (
            <span className="text-xs text-emerald-300 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
              {actionNotice}
            </span>
          )}
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-sm">Loading moderation queue...</div>
          ) : filteredReports.length === 0 ? (
            <div className="py-16 text-center">
              <Check className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">Moderation queue is clean</p>
              <p className="text-xs text-slate-500 mt-1">No reported violations in this view.</p>
            </div>
          ) : (
            filteredReports.map((r: any) => (
              <div
                key={r.id}
                className="p-4 rounded-xl bg-[#0d1117] border border-white/5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-rose-400 flex items-center gap-1">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Report: {r.reason}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">By {r.reporter_name || 'Member'}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-500 tabular-nums">
                        {new Date(r.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="mt-2 p-2.5 rounded-lg bg-[#161b22] border border-white/5 text-xs text-slate-200">
                      <span className="font-semibold text-slate-400 block mb-0.5">
                        Author: {r.sender_name || 'User'} (@{r.sender_username || 'user'})
                      </span>
                      <p className="italic text-slate-300">
                        {r.message_content ? `"${r.message_content}"` : '(Message already removed)'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded capitalize ${
                      r.status === 'pending'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800'
                        : r.status === 'resolved'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                {r.status === 'pending' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => handleResolve(r.id, 'dismissed')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-[#21262d] hover:bg-[#30363d] rounded-lg transition-colors"
                    >
                      Dismiss Report
                    </button>
                    {r.message_content && (
                      <button
                        onClick={() => handleDeleteMessage(r)}
                        className="px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Message</span>
                      </button>
                    )}
                    {r.message_sender_id && (
                      <button
                        onClick={() => handleBanUser(r)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-600 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Ban User</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
