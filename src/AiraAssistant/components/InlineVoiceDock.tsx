import type { VoiceState } from '../types';
import { CompactPillVisualizer } from './CompactPillVisualizer';
import { toVisualizerState } from './WaveformVisualizer';

const STAGE_TEXT: Record<VoiceState, string> = {
  IDLE: 'Listening...',
  LISTENING: 'Listening...',
  PROCESSING: 'Thinking...',
  SYNTHESIZING: 'Preparing...',
  SPEAKING: 'Speaking...',
  ERROR: 'Something went wrong',
};

/**
 * Mode A — Inline Morphing Bar (manual mic activation).
 *
 * Replaces the bottom chat composer with a compact voice dock:
 * blue mic icon → interactive pill visualizer → concise stage text →
 * right control (Stop TTS while speaking, keyboard exit otherwise).
 */
export function InlineVoiceDock({
  voiceState,
  audioLevel,
  onExit,
  onStopPlayback,
}: {
  voiceState: VoiceState;
  audioLevel: number;
  onExit: () => void;
  /** Manual barge-in — halts TTS and returns the dock to listening. */
  onStopPlayback: () => void;
}) {
  const stageText = STAGE_TEXT[voiceState] ?? STAGE_TEXT.IDLE;
  const visualizerState = toVisualizerState(voiceState);
  const isSpeaking = voiceState === 'SPEAKING';

  return (
    <div className="aira-inline-voice-dock" role="status" aria-live="polite">
      {/* Left: primary AIR₂O blue mic */}
      <span className="aira-dock-mic" aria-hidden="true">
        <i className="bi bi-mic-fill" />
      </span>

      {/* Interactive compact pill visualizer (fixed 60×24) */}
      <CompactPillVisualizer state={visualizerState} audioLevel={audioLevel} />

      {/* Concise stage text — flex-1 + truncate so it never overflows */}
      <span className="aira-dock-stage-text">{stageText}</span>

      {/* Right control: Stop TTS while AIRA is speaking, keyboard exit otherwise */}
      {isSpeaking ? (
        <button
          type="button"
          className="aira-dock-keyboard-btn aira-dock-stop-btn"
          onClick={onStopPlayback}
          aria-label="Stop TTS Playback"
          title="Stop TTS Playback"
        >
          <i className="bi bi-stop-fill" />
        </button>
      ) : (
        <button
          type="button"
          className="aira-dock-keyboard-btn"
          onClick={onExit}
          aria-label="Switch to keyboard"
          title="Switch to keyboard"
        >
          <i className="bi bi-keyboard" />
        </button>
      )}
    </div>
  );
}
