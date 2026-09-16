import { useEffect, useRef } from 'react';

const BAR_COUNT = 4;

/**
 * Compact 4-bar equalizer pill for the inline morphing voice dock.
 *
 * Fixed-size container (60×24px) housing four `#00C2FF` bars that react to
 * the live mic/output level. During `processing` / `synthesizing` the bars
 * animate continuously so latency reads as activity, not a hang.
 */
export function CompactPillVisualizer({
  state,
  audioLevel,
}: {
  state: 'idle' | 'listening' | 'processing' | 'synthesizing' | 'speaking';
  audioLevel: number;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const levelRef = useRef(audioLevel);
  const smoothRef = useRef(0);
  const stateRef = useRef(state);

  levelRef.current = audioLevel;
  stateRef.current = state;

  useEffect(() => {
    let raf = 0;
    let running = true;

    const tick = (time: number) => {
      if (!running) return;
      const t = time / 1000;
      const current = stateRef.current;

      const target = current === 'listening' || current === 'speaking' ? levelRef.current : 0;
      smoothRef.current += (target - smoothRef.current) * 0.3;
      const level = Math.max(0, Math.min(1, smoothRef.current));

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const el = barsRef.current[i];
        if (!el) continue;

        let scale: number;
        switch (current) {
          case 'listening':
          case 'speaking': {
            // Live audio reaction with per-bar phase offset.
            const jitter = 0.6 + 0.4 * Math.abs(Math.sin(i * 2.7 + t * 9));
            scale = 0.25 + level * jitter * 1.1;
            break;
          }
          case 'processing':
          case 'synthesizing': {
            // Continuous wave — AI is active even without audio input.
            const phase = t * (current === 'processing' ? 5 : 3.6) - i * 0.9;
            scale = 0.3 + 0.7 * Math.abs(Math.sin(phase));
            break;
          }
          default: {
            scale = 0.22 + 0.12 * Math.sin(t * 2 - i * 0.8);
          }
        }

        el.style.transform = `scaleY(${Math.max(0.18, Math.min(1, scale))})`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`aira-pill-viz aira-pill-viz-${state}`} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} ref={(el) => { barsRef.current[i] = el; }} />
      ))}
    </div>
  );
}
