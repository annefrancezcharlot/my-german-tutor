import {
  getRealtimeCredentials,
  persistRealtimeTranscript,
  reportRealtimeUsage,
} from '../api';
import type { Message } from '../types';

export type RealtimeState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export interface RealtimeCallbacks {
  onState: (state: RealtimeState) => void;
  onTranscript: (message: Message) => void;
  onAssistantDraft: (text: string) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
  onLimit: (seconds: number) => void;
}

export class RealtimeDiscussion {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private sequence: number;
  private writeQueue: Promise<void> = Promise.resolve();
  private assistantDraft = '';
  private timeoutId: number | null = null;
  private disconnectTimeoutId: number | null = null;
  private channelTimeoutId: number | null = null;
  private channelReadyReject: ((error: Error) => void) | null = null;
  private setupAbort = new AbortController();
  private stopped = false;
  private readonly handlePageExit = () => this.stop();
  private readonly handleFatalBrowserError = () => this.stop();

  constructor(
    private sessionId: number,
    existingMessageCount: number,
    private voice: string,
    private callbacks: RealtimeCallbacks,
  ) {
    this.sequence = existingMessageCount;
  }

  async start() {
    this.callbacks.onState('connecting');
    window.addEventListener('pagehide', this.handlePageExit);
    window.addEventListener('beforeunload', this.handlePageExit);
    window.addEventListener('error', this.handleFatalBrowserError);
    window.addEventListener('unhandledrejection', this.handleFatalBrowserError);
    try {
      const credentials = await getRealtimeCredentials(this.sessionId, this.voice);
      this.ensureActive();
      this.callbacks.onLimit(credentials.max_seconds);
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
      this.ensureActive();
      this.localStream.getAudioTracks().forEach(track => {
        track.onended = () => this.failAndStop('Microphone access ended.');
      });
      this.peer = new RTCPeerConnection();
      this.localStream.getTracks().forEach(track => this.peer?.addTrack(track, this.localStream!));
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
      this.peer.ontrack = event => {
        if (this.remoteAudio) this.remoteAudio.srcObject = event.streams[0];
      };
      this.peer.onconnectionstatechange = () => {
        const state = this.peer?.connectionState;
        if (state === 'connected') {
          if (this.disconnectTimeoutId !== null) window.clearTimeout(this.disconnectTimeoutId);
          this.disconnectTimeoutId = null;
        } else if (state === 'disconnected' && this.disconnectTimeoutId === null) {
          this.disconnectTimeoutId = window.setTimeout(() => {
            if (this.peer?.connectionState === 'disconnected') {
              this.failAndStop('The live voice connection was lost.');
            }
          }, 5000);
        } else if (state === 'failed' || state === 'closed') {
          this.failAndStop('The live voice connection ended.');
        }
      };
      this.peer.oniceconnectionstatechange = () => {
        const state = this.peer?.iceConnectionState;
        if (state === 'failed' || state === 'closed') {
          this.failAndStop('The live voice network connection ended.');
        }
      };
      this.channel = this.peer.createDataChannel('oai-events');
      this.channel.onmessage = event => {
        try {
          this.handleEvent(JSON.parse(event.data));
        } catch {
          this.failAndStop('The live voice service returned an invalid event.');
        }
      };
      this.channel.onerror = () => this.failAndStop('The live voice event channel failed.');
      this.channel.onclose = () => {
        if (!this.stopped) this.failAndStop('The live voice event channel closed.');
      };
      const channelReady = new Promise<void>((resolve, reject) => {
        if (!this.channel) return reject(new Error('No Realtime data channel.'));
        this.channelReadyReject = reject;
        this.channel.onopen = () => {
          if (this.channelTimeoutId !== null) window.clearTimeout(this.channelTimeoutId);
          this.channelTimeoutId = null;
          this.channelReadyReject = null;
          resolve();
        };
        this.channelTimeoutId = window.setTimeout(() => {
          this.channelTimeoutId = null;
          this.channelReadyReject = null;
          reject(new Error('Realtime connection timed out.'));
        }, 15000);
      });
      const offer = await this.peer.createOffer();
      this.ensureActive();
      await this.peer.setLocalDescription(offer);
      this.ensureActive();
      const answerResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        signal: this.setupAbort.signal,
        headers: {
          Authorization: `Bearer ${credentials.client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });
      if (!answerResponse.ok) throw new Error(`Realtime SDP failed (${answerResponse.status})`);
      const answer = await answerResponse.text();
      this.ensureActive();
      await this.peer.setRemoteDescription({ type: 'answer', sdp: answer });
      await channelReady;
      this.ensureActive();
      this.callbacks.onState('listening');
      this.channel.send(JSON.stringify({ type: 'response.create' }));
      this.timeoutId = window.setTimeout(() => {
        this.stop();
        this.callbacks.onTimeout();
      }, credentials.max_seconds * 1000);
    } catch (error) {
      const cancelledByCleanup = this.stopped;
      this.stop();
      if (cancelledByCleanup) {
        const cancelled = new Error('Realtime startup was cancelled.');
        cancelled.name = 'AbortError';
        throw cancelled;
      }
      throw error;
    }
  }

  private ensureActive() {
    if (this.stopped) throw new Error('Realtime connection was stopped.');
  }

  private failAndStop(message: string) {
    if (this.stopped) return;
    this.stop();
    this.callbacks.onError(message);
  }

  private enqueueTranscript(role: 'user' | 'assistant', content: string) {
    const clean = content.trim();
    if (!clean) return;
    this.writeQueue = this.writeQueue.then(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const saved = await persistRealtimeTranscript(this.sessionId, this.sequence, role, clean);
          this.sequence = saved.next_sequence;
          this.callbacks.onTranscript({ id: saved.message_id, role, content: clean });
          return;
        } catch (error) {
          lastError = error;
          await new Promise(resolve => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw lastError;
    }).catch(() => {
      this.callbacks.onError('A transcript turn could not be saved after three attempts.');
    });
  }

  private handleEvent(event: Record<string, any>) {
    const type = String(event.type ?? '');
    if (type === 'input_audio_buffer.speech_started') this.callbacks.onState('listening');
    if (type === 'input_audio_buffer.speech_stopped') this.callbacks.onState('thinking');
    if (type === 'response.created' || type === 'response.output_item.added') this.callbacks.onState('speaking');
    if (type === 'conversation.item.input_audio_transcription.completed') {
      this.enqueueTranscript('user', String(event.transcript ?? ''));
    }
    if (type === 'response.output_audio_transcript.delta') {
      this.assistantDraft += String(event.delta ?? '');
      this.callbacks.onAssistantDraft(this.assistantDraft);
    }
    if (type === 'response.output_audio_transcript.done') {
      const transcript = String(event.transcript ?? this.assistantDraft);
      this.assistantDraft = '';
      this.callbacks.onAssistantDraft('');
      this.enqueueTranscript('assistant', transcript);
    }
    if (type === 'response.done') {
      this.callbacks.onState('listening');
      const usage = event.response?.usage;
      if (usage) {
        void reportRealtimeUsage(this.sessionId, {
          input_audio_tokens: usage.input_token_details?.audio_tokens ?? 0,
          output_audio_tokens: usage.output_token_details?.audio_tokens ?? 0,
          input_text_tokens: usage.input_token_details?.text_tokens ?? 0,
          output_text_tokens: usage.output_token_details?.text_tokens ?? 0,
        }).catch(() => undefined);
      }
    }
    if (type === 'error') this.failAndStop(event.error?.message ?? 'Realtime voice error.');
  }

  async flush(maxWaitMs = 5000) {
    await new Promise<void>(resolve => {
      const timeout = window.setTimeout(resolve, maxWaitMs);
      this.writeQueue.then(
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
      );
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener('pagehide', this.handlePageExit);
    window.removeEventListener('beforeunload', this.handlePageExit);
    window.removeEventListener('error', this.handleFatalBrowserError);
    window.removeEventListener('unhandledrejection', this.handleFatalBrowserError);
    if (this.timeoutId !== null) window.clearTimeout(this.timeoutId);
    if (this.disconnectTimeoutId !== null) window.clearTimeout(this.disconnectTimeoutId);
    if (this.channelTimeoutId !== null) window.clearTimeout(this.channelTimeoutId);
    this.timeoutId = null;
    this.disconnectTimeoutId = null;
    this.channelTimeoutId = null;
    this.setupAbort.abort();
    this.channelReadyReject?.(new Error('Realtime connection was stopped.'));
    this.channelReadyReject = null;
    const channel = this.channel;
    const peer = this.peer;
    this.channel = null;
    this.peer = null;
    try {
      if (channel) {
        channel.onopen = null;
        channel.onmessage = null;
        channel.onerror = null;
        channel.onclose = null;
        channel.close();
      }
    } catch { /* Continue shutting down the remaining media resources. */ }
    try {
      if (peer) {
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.oniceconnectionstatechange = null;
        peer.getSenders().forEach(sender => sender.track?.stop());
        peer.close();
      }
    } catch { /* Local stream cleanup below is an independent fallback. */ }
    try {
      this.localStream?.getTracks().forEach(track => track.stop());
    } catch { /* The peer has already been closed if a browser track API fails. */ }
    try {
      if (this.remoteAudio) {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
      }
    } catch { /* Receiving stops with the peer even if audio element cleanup fails. */ }
    this.localStream = null;
    this.remoteAudio = null;
    this.callbacks.onState('ended');
  }
}
