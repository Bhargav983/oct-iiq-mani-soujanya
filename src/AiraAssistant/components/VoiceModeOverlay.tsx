import { useEffect, useRef, useState } from 'react';
import type { VoiceState } from '../types';
import { toVisualizerState } from './WaveformVisualizer';

const STATUS_BY_STATE: Record<VoiceState, string> = {
  IDLE: 'Listening',
  LISTENING: 'Listening',
  PROCESSING: 'Thinking',
  SYNTHESIZING: 'Preparing response',
  SPEAKING: 'AIRA is speaking',
  ERROR: 'Something went wrong',
};

/**
 * Mode B — Dedicated AIR₂O Light-Theme Orb Overlay (wake-word activation).
 *
 * Full-screen soft-gradient sheet with a fluid 3D-style orb:
 * - LISTENING: gentle pulse scaled by live mic volume
 * - PROCESSING: continuous liquid wave morphing/rotation (masks n8n latency)
 * - SYNTHESIZING: shimmering gradient ring (masks TTS fetch latency)
 * - SPEAKING: expanding concentric ripples synced to output audio
 */
export function VoiceModeOverlay({
  voiceState,
  audioLevel,
  transcript,
  onEndSession,
  onSwitchToKeyboard,
  onStopPlayback,
}: {
  voiceState: VoiceState;
  audioLevel: number;
  transcript: string;
  onEndSession: () => void;
  onSwitchToKeyboard: () => void;
  /** Manual barge-in — halts TTS and returns the orb to listening. */
  onStopPlayback: () => void;
}) {
  const [dotCount, setDotCount] = useState(1);
  const orbRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(audioLevel);
  const smoothRef = useRef(0);

  levelRef.current = audioLevel;

  // Animate trailing dots of the status text.
  useEffect(() => {
    const id = window.setInterval(() => setDotCount((c) => (c % 3) + 1), 450);
    return () => window.clearInterval(id);
  }, []);

  const voiceStateRef = useRef(voiceState);
  voiceStateRef.current = voiceState;

  // Drive orb scale from smoothed mic level during LISTENING.
  useEffect(() => {
    let raf = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      const current = toVisualizerState(voiceStateRef.current);
      if (orbRef.current) {
        if (current === 'listening') {
          smoothRef.current += (levelRef.current - smoothRef.current) * 0.2;
          const scale = 1 + smoothRef.current * 0.18;
          orbRef.current.style.setProperty('--aira-orb-scale', scale.toFixed(3));
        } else {
          orbRef.current.style.setProperty('--aira-orb-scale', '1');
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const baseStatus = STATUS_BY_STATE[voiceState] ?? STATUS_BY_STATE.IDLE;
  const statusText =
    voiceState === 'ERROR' ? baseStatus : `${baseStatus}${'.'.repeat(dotCount)}`;
  const visualizerState = toVisualizerState(voiceState);
  const isSpeaking = voiceState === 'SPEAKING';

  return (
    <div className="aira-orb-overlay" role="dialog" aria-modal="true" aria-label="AIRA Voice Assistant">
      {/* Ambient blue glows */}
      <div className="aira-orb-glow aira-orb-glow-1" aria-hidden="true" />
      <div className="aira-orb-glow aira-orb-glow-2" aria-hidden="true" />

      {/* Header */}
      <header className="aira-orb-header">
        <button
          type="button"
          className="aira-orb-icon-btn"
          onClick={onEndSession}
          aria-label="Back"
        >
          <i className="bi bi-arrow-left" />
        </button>
        <span className="aira-orb-title">AIR₂O</span>
        <span style={{ width: 40 }} aria-hidden="true" />
      </header>

      {/* Center interactive orb */}
      <div className="aira-orb-center">
        <div className={`aira-orb-stage aira-orb-stage-${visualizerState}`}>
          {/* Concentric ripple rings — SPEAKING */}
          <div className="aira-orb-ripple aira-orb-ripple-1" aria-hidden="true" />
          <div className="aira-orb-ripple aira-orb-ripple-2" aria-hidden="true" />
          <div className="aira-orb-ripple aira-orb-ripple-3" aria-hidden="true" />

          {/* Shimmering gradient ring — SYNTHESIZING */}
          <div className="aira-orb-ring" aria-hidden="true" />

          {/* Liquid wave morph layers — PROCESSING */}
          <div className="aira-orb-wave aira-orb-wave-1" aria-hidden="true" />
          <div className="aira-orb-wave aira-orb-wave-2" aria-hidden="true" />

          {/* The orb core — tappable to stop TTS while speaking */}
          <div
            ref={orbRef}
            className={`aira-orb-core aira-orb-${visualizerState}${isSpeaking ? ' aira-orb-tappable' : ''}`}
            onClick={isSpeaking ? onStopPlayback : undefined}
            role={isSpeaking ? 'button' : undefined}
            tabIndex={isSpeaking ? 0 : undefined}
            onKeyDown={isSpeaking ? (e) => { if (e.key === 'Enter' || e.key === ' ') onStopPlayback(); } : undefined}
            aria-label={isSpeaking ? 'Stop TTS Playback' : undefined}
          >
            <div className="aira-orb-highlight" />
            <span className="aira-orb-brand">AIR₂O</span>
            {/* Tap-to-Stop badge — visible only while AIRA is speaking */}
            {isSpeaking && (
              <span className="aira-orb-stop-badge" aria-hidden="true">
                <i className="bi bi-stop-fill" /> Stop
              </span>
            )}
          </div>
        </div>

        <p className="aira-orb-status" aria-live="polite">{statusText}</p>
        {transcript ? <p className="aira-orb-transcript">{transcript}</p> : null}
      </div>

      {/* Bottom controls — Stop Audio while speaking, End Session otherwise */}
      <div className="aira-orb-controls">
        {isSpeaking ? (
          <button
            type="button"
            className="aira-orb-btn aira-orb-btn-stop"
            onClick={onStopPlayback}
            aria-label="Stop TTS Playback"
            title="Stop TTS Playback"
          >
            <i className="bi bi-stop-fill" />
          </button>
        ) : (
          <button
            type="button"
            className="aira-orb-btn aira-orb-btn-danger"
            onClick={onEndSession}
            aria-label="End session"
            title="End session"
          >
            <i className="bi bi-x-lg" />
          </button>
        )}
        <button
          type="button"
          className="aira-orb-btn"
          onClick={onSwitchToKeyboard}
          aria-label="Switch to chat"
          title="Switch to chat"
        >
          <i className="bi bi-keyboard" />
        </button>
      </div>
    </div>
  );
}
