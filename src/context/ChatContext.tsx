import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Channel, Message, User, UserStatus, VoiceChannel, VoiceUser } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

interface TypingIndicator {
  id: string;
  username: string;
  display_name: string;
}

interface ChatContextType {
  channels: Channel[];
  voiceChannels: VoiceChannel[];
  currentChannel: Channel | null;
  currentDmUser: User | null;
  currentVoiceChannel: VoiceChannel | null;
  voiceUsers: VoiceUser[];
  isVoiceConnected: boolean;
  isVoiceMuted: boolean;
  isVoiceDeafened: boolean;
  isSpeaking: boolean;
  messages: Message[];
  loadingMessages: boolean;
  onlineUsers: User[];
  typingUsers: TypingIndicator[];
  isConnected: boolean;
  selectChannel: (channel: Channel) => void;
  selectDm: (user: User) => void;
  joinVoiceChannel: (vc: VoiceChannel) => Promise<void>;
  leaveVoiceChannel: () => void;
  toggleVoiceMute: () => void;
  toggleVoiceDeafen: () => void;
  sendMessage: (content: string, imageUrl?: string, replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  togglePin: (messageId: string) => void;
  sendTyping: (isTyping: boolean) => void;
  updateUserStatus: (status: UserStatus, customStatus?: string) => void;
  refreshChannels: () => Promise<void>;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  editingMessage: Message | null;
  setEditingMessage: (msg: Message | null) => void;
  activeLightboxUrl: string | null;
  setActiveLightboxUrl: (url: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Web Audio chime
function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio interaction restriction
  }
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, token, logout } = useAuth();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [currentDmUser, setCurrentDmUser] = useState<User | null>(null);
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<VoiceChannel | null>(null);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isVoiceDeafened, setIsVoiceDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const typingTimeoutMap = useRef<Map<string, any>>(new Map());

  // WebRTC & Audio references
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingCheckIntervalRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Load channels and voice channels
  const refreshChannels = useCallback(async () => {
    try {
      const [chanRes, voiceRes] = await Promise.all([
        api.fetchChannels(),
        api.fetchVoiceChannels(),
      ]);
      setChannels(chanRes.channels);
      setVoiceChannels(voiceRes.voiceChannels);

      // Default to general channel if none selected
      if (!currentChannel && !currentDmUser && chanRes.channels.length > 0) {
        const general = chanRes.channels.find((c) => c.name === 'general-chat') || chanRes.channels[0];
        setCurrentChannel(general);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    }
  }, [currentChannel, currentDmUser]);

  useEffect(() => {
    refreshChannels();
  }, [refreshChannels]);

  // Load messages whenever current channel or DM changes
  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      if (!currentChannel && !currentDmUser) return;
      setLoadingMessages(true);
      try {
        if (currentChannel) {
          const res = await api.fetchChannelMessages(currentChannel.id, 60);
          if (!isCancelled) setMessages(res.messages);
        } else if (currentDmUser) {
          const res = await api.fetchDmMessages(currentDmUser.id, 60);
          if (!isCancelled) setMessages(res.messages);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!isCancelled) setLoadingMessages(false);
      }
    }

    setMessages([]);
    setReplyingTo(null);
    setEditingMessage(null);
    setTypingUsers([]);
    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [currentChannel, currentDmUser]);

  // Periodic polling fallback when WebSocket is not connected (e.g. on Vercel Serverless)
  useEffect(() => {
    if (isConnected || !token || !user) return;
    if (!currentChannel && !currentDmUser) return;

    const interval = setInterval(async () => {
      try {
        if (currentChannel) {
          const res = await api.fetchChannelMessages(currentChannel.id, 60);
          setMessages((prev) => {
            if (res.messages.length === prev.length && res.messages[res.messages.length - 1]?.id === prev[prev.length - 1]?.id) {
              return prev;
            }
            return res.messages;
          });
        } else if (currentDmUser) {
          const res = await api.fetchDmMessages(currentDmUser.id, 60);
          setMessages((prev) => {
            if (res.messages.length === prev.length && res.messages[res.messages.length - 1]?.id === prev[prev.length - 1]?.id) {
              return prev;
            }
            return res.messages;
          });
        }
      } catch {
        // Silent fallback
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isConnected, token, user, currentChannel, currentDmUser]);

  // Create WebRTC peer connection helper
  const createPeerConnection = useCallback((remoteUserId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current.has(remoteUserId)) {
      return peerConnectionsRef.current.get(remoteUserId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'voice_signal',
            toUserId: remoteUserId,
            signal: { candidate: event.candidate },
          })
        );
      }
    };

    pc.ontrack = (event) => {
      let audioEl = remoteAudioElementsRef.current.get(remoteUserId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        remoteAudioElementsRef.current.set(remoteUserId, audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.muted = isVoiceDeafened;
      audioEl.play().catch(() => {});
    };

    peerConnectionsRef.current.set(remoteUserId, pc);

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'voice_signal',
                toUserId: remoteUserId,
                signal: { sdp: pc.localDescription },
              })
            );
          }
        })
        .catch(console.error);
    }

    return pc;
  }, [isVoiceDeafened]);

  // Voice Chat Cleanup helper
  const teardownVoice = useCallback(() => {
    if (speakingCheckIntervalRef.current) {
      clearInterval(speakingCheckIntervalRef.current);
      speakingCheckIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudioElementsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    remoteAudioElementsRef.current.clear();

    setCurrentVoiceChannel(null);
    setVoiceUsers([]);
    setIsSpeaking(false);
  }, []);

  // Manage WebSocket connection
  useEffect(() => {
    if (!token || !user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      teardownVoice();
      return;
    }

    const activeUser = user;
    let isMounted = true;

    function connectWs() {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'auth', token }));

        if (currentChannel) {
          ws.send(JSON.stringify({ type: 'join_channel', channelId: currentChannel.id }));
        }
      };

      ws.onmessage = async (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'auth_success':
              break;

            case 'auth_error':
              console.warn('WebSocket message error:', data.message);
              if (data.message.includes('banned')) {
                logout();
              }
              break;

            case 'new_message': {
              const newMsg: Message = data.message;
              const isRelevant =
                (currentChannel && newMsg.channel_id === currentChannel.id) ||
                (currentDmUser &&
                  !newMsg.channel_id &&
                  ((newMsg.sender_id === currentDmUser.id && newMsg.recipient_id === activeUser.id) ||
                    (newMsg.sender_id === activeUser.id && newMsg.recipient_id === currentDmUser.id)));

              if (isRelevant) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
              }

              if (newMsg.sender_id !== activeUser.id) {
                playNotificationSound();
              }
              break;
            }

            case 'reaction_updated': {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === data.messageId) {
                    return { ...m, reactions: data.reactions };
                  }
                  return m;
                })
              );
              break;
            }

            case 'message_edited': {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === data.messageId) {
                    return { ...m, content: data.content, is_edited: 1, updated_at: data.updated_at };
                  }
                  return m;
                })
              );
              break;
            }

            case 'message_deleted': {
              setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
              break;
            }

            case 'message_pinned': {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === data.messageId) {
                    return { ...m, is_pinned: data.isPinned ? 1 : 0 };
                  }
                  return m;
                })
              );
              break;
            }

            case 'user_typing': {
              const { user: typingUser, channelId, recipientId, isTyping: userIsTyping } = data;
              const matchesCurrent =
                (currentChannel && channelId === currentChannel.id) ||
                (currentDmUser && recipientId === activeUser.id && typingUser.id === currentDmUser.id);

              if (!matchesCurrent) return;

              if (userIsTyping) {
                setTypingUsers((prev) => {
                  if (prev.some((u) => u.id === typingUser.id)) return prev;
                  return [...prev, typingUser];
                });

                if (typingTimeoutMap.current.has(typingUser.id)) {
                  clearTimeout(typingTimeoutMap.current.get(typingUser.id));
                }

                const timeout = setTimeout(() => {
                  setTypingUsers((prev) => prev.filter((u) => u.id !== typingUser.id));
                  typingTimeoutMap.current.delete(typingUser.id);
                }, 3500);

                typingTimeoutMap.current.set(typingUser.id, timeout);
              } else {
                setTypingUsers((prev) => prev.filter((u) => u.id !== typingUser.id));
                if (typingTimeoutMap.current.has(typingUser.id)) {
                  clearTimeout(typingTimeoutMap.current.get(typingUser.id));
                  typingTimeoutMap.current.delete(typingUser.id);
                }
              }
              break;
            }

            case 'online_users': {
              setOnlineUsers(data.users || []);
              break;
            }

            case 'channel_created': {
              setChannels((prev) => {
                if (prev.some((c) => c.id === data.channel.id)) return prev;
                return [...prev, data.channel];
              });
              break;
            }

            case 'user_banned': {
              if (data.userId === activeUser.id) {
                logout();
              }
              break;
            }

            // --- VOICE CHAT PROTOCOLS ---
            case 'voice_channel_users': {
              setVoiceUsers(data.users || []);
              // Connect WebRTC peer connection to existing occupants
              data.users.forEach((occupant: VoiceUser) => {
                if (occupant.user.id !== activeUser.id) {
                  createPeerConnection(occupant.user.id, true);
                }
              });
              break;
            }

            case 'voice_user_joined': {
              setVoiceUsers((prev) => {
                if (prev.some((vu) => vu.user.id === data.user.id)) return prev;
                return [
                  ...prev,
                  {
                    user: data.user,
                    isMuted: data.isMuted,
                    isDeafened: data.isDeafened,
                    isSpeaking: false,
                  },
                ];
              });
              // Answer peer connection
              if (data.user.id !== activeUser.id) {
                createPeerConnection(data.user.id, false);
              }
              break;
            }

            case 'voice_user_left': {
              setVoiceUsers((prev) => prev.filter((vu) => vu.user.id !== data.userId));
              const pc = peerConnectionsRef.current.get(data.userId);
              if (pc) {
                pc.close();
                peerConnectionsRef.current.delete(data.userId);
              }
              const audioEl = remoteAudioElementsRef.current.get(data.userId);
              if (audioEl) {
                audioEl.pause();
                audioEl.srcObject = null;
                remoteAudioElementsRef.current.delete(data.userId);
              }
              break;
            }

            case 'voice_state_update': {
              setVoiceUsers((prev) =>
                prev.map((vu) => {
                  if (vu.user.id === data.userId) {
                    return {
                      ...vu,
                      isMuted: data.isMuted,
                      isDeafened: data.isDeafened,
                      isSpeaking: data.isSpeaking,
                    };
                  }
                  return vu;
                })
              );
              break;
            }

            case 'voice_signal': {
              const fromUserId = data.fromUserId;
              let pc = peerConnectionsRef.current.get(fromUserId);
              if (!pc) {
                pc = createPeerConnection(fromUserId, false);
              }

              if (data.signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                if (data.signal.sdp.type === 'offer') {
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  wsRef.current?.send(
                    JSON.stringify({
                      type: 'voice_signal',
                      toUserId: fromUserId,
                      signal: { sdp: pc.localDescription },
                    })
                  );
                }
              } else if (data.signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
              }
              break;
            }

            case 'voice_audio_relay': {
              // Direct audio playback fallback
              if (!isVoiceDeafened && data.audioData) {
                try {
                  const audio = new Audio(data.audioData);
                  audio.play().catch(() => {});
                } catch {}
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      teardownVoice();
    };
  }, [token, user, currentChannel, currentDmUser, isVoiceDeafened, logout, createPeerConnection, teardownVoice]);

  const selectChannel = (channel: Channel) => {
    setCurrentDmUser(null);
    setCurrentChannel(channel);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'join_channel', channelId: channel.id }));
    }
  };

  const selectDm = (dmUser: User) => {
    setCurrentChannel(null);
    setCurrentDmUser(dmUser);
  };

  // --- Voice Chat Actions ---
  const joinVoiceChannel = async (vc: VoiceChannel) => {
    // If clicking same channel already connected, do nothing
    if (currentVoiceChannel?.id === vc.id) return;

    teardownVoice();
    setCurrentVoiceChannel(vc);

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;

      // Setup audio analyzer for speaking detection
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let speakingCounter = 0;

        speakingCheckIntervalRef.current = setInterval(() => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const detectedSpeaking = average > 14 && !isVoiceMuted;

          if (detectedSpeaking) {
            speakingCounter = 4;
            setIsSpeaking(true);
            wsRef.current?.send(
              JSON.stringify({
                type: 'voice_state',
                isMuted: isVoiceMuted,
                isDeafened: isVoiceDeafened,
                isSpeaking: true,
              })
            );
          } else if (speakingCounter > 0) {
            speakingCounter -= 1;
          } else {
            setIsSpeaking(false);
            wsRef.current?.send(
              JSON.stringify({
                type: 'voice_state',
                isMuted: isVoiceMuted,
                isDeafened: isVoiceDeafened,
                isSpeaking: false,
              })
            );
          }
        }, 150);
      }

      // Audio relay fallback recorder
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && !isVoiceMuted && wsRef.current?.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              wsRef.current?.send(
                JSON.stringify({
                  type: 'voice_audio_relay',
                  audioData: base64Audio,
                })
              );
            };
            reader.readAsDataURL(e.data);
          }
        };
        recorder.start(400); // 400ms slices for smooth low-latency transmission
      }
    } catch (err) {
      console.warn('Microphone permission not granted or unavailable; joining in listen-only mode:', err);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join_voice',
          channelId: vc.id,
          isMuted: isVoiceMuted,
          isDeafened: isVoiceDeafened,
        })
      );
    }
  };

  const leaveVoiceChannel = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave_voice' }));
    }
    teardownVoice();
  };

  const toggleVoiceMute = () => {
    const nextMuted = !isVoiceMuted;
    setIsVoiceMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice_state',
          isMuted: nextMuted,
          isDeafened: isVoiceDeafened,
          isSpeaking: false,
        })
      );
    }
  };

  const toggleVoiceDeafen = () => {
    const nextDeafened = !isVoiceDeafened;
    setIsVoiceDeafened(nextDeafened);

    // Mute all remote audio playback
    remoteAudioElementsRef.current.forEach((el) => {
      el.muted = nextDeafened;
    });

    // When deafened, also mute microphone
    if (nextDeafened) {
      setIsVoiceMuted(true);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice_state',
          isMuted: nextDeafened ? true : isVoiceMuted,
          isDeafened: nextDeafened,
          isSpeaking: false,
        })
      );
    }
  };

  const sendMessage = async (content: string, imageUrl?: string, replyToId?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'send_message',
          channelId: currentChannel?.id,
          recipientId: currentDmUser?.id,
          content,
          imageUrl,
          replyToId,
        })
      );
    } else {
      // Fallback via REST API (e.g. on Vercel Serverless)
      const res = await api.postMessage({
        channelId: currentChannel?.id,
        recipientId: currentDmUser?.id,
        content,
        imageUrl,
        replyToId,
      });
      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
      }
    }

    setReplyingTo(null);
  };

  const editMessage = async (messageId: string, content: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'edit_message',
          messageId,
          content,
        })
      );
    } else {
      const res = await api.patchMessage(messageId, content);
      if (res.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: res.message.content, is_edited: 1 } : m))
        );
      }
    }
    setEditingMessage(null);
  };

  const deleteMessage = async (messageId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'delete_message',
          messageId,
        })
      );
    } else {
      await api.removeMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'toggle_reaction',
          messageId,
          emoji,
        })
      );
    } else {
      await api.toggleReaction(messageId, emoji);
      if (currentChannel) {
        api.fetchChannelMessages(currentChannel.id).then((res) => setMessages(res.messages));
      } else if (currentDmUser) {
        api.fetchDmMessages(currentDmUser.id).then((res) => setMessages(res.messages));
      }
    }
  };

  const togglePin = async (messageId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'toggle_pin',
          messageId,
        })
      );
    } else {
      const res = await api.togglePin(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: res.is_pinned } : m))
      );
    }
  };

  const sendTyping = (isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'typing',
        channelId: currentChannel?.id,
        recipientId: currentDmUser?.id,
        isTyping,
      })
    );
  };

  const updateUserStatus = (status: UserStatus, customStatus?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'update_status',
        status,
        customStatus,
      })
    );
  };

  return (
    <ChatContext.Provider
      value={{
        channels,
        voiceChannels,
        currentChannel,
        currentDmUser,
        currentVoiceChannel,
        voiceUsers,
        isVoiceConnected: Boolean(currentVoiceChannel),
        isVoiceMuted,
        isVoiceDeafened,
        isSpeaking,
        messages,
        loadingMessages,
        onlineUsers,
        typingUsers,
        isConnected,
        selectChannel,
        selectDm,
        joinVoiceChannel,
        leaveVoiceChannel,
        toggleVoiceMute,
        toggleVoiceDeafen,
        sendMessage,
        editMessage,
        deleteMessage,
        toggleReaction,
        togglePin,
        sendTyping,
        updateUserStatus,
        refreshChannels,
        replyingTo,
        setReplyingTo,
        editingMessage,
        setEditingMessage,
        activeLightboxUrl,
        setActiveLightboxUrl,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}
