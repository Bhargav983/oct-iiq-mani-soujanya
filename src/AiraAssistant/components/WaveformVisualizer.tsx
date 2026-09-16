import { useEffect, useMemo, useRef } from 'react';

export type VisualizerState = 'idle' | 'listening' | 'processing' | 'synthesizing' | 'speaking';

const BAR_COUNT = 48;

/**
 * Maps the pipeline VoiceState to a visualizer phase. `ERROR` and unknown
 * states fall back to `idle`.
 */
export function toVisualizerState(state: string): VisualizerState {
  switch (state) {
    case 'LISTENING':
      return 'listening';
    case 'PROCESSING':
      return 'processing';
    case 'SYNTHESIZING':
      return 'synthesizing';
    case 'SPEAKING':
      return 'speaking';
    default:
      return 'idle';
  }
}

/**
 * ChatGPT-style fluid audio visualizer.
 *
 * - `listening` / `speaking`: bars react live to `audioLevel` (mic or output).
 * - `processing`: continuous flowing sine wave so n8n latency feels like
 *   active "thinking" rather than a hang.
 * - `synthesizing`: same flow but with a shimmering gradient sweep while the
 *   TTS audio is being generated.
 * - `idle`: gentle breathing pulse.
 *
 * Rendered on a canvas with requestAnimationFrame for 60fps fluidity without
 * re-rendering React on every audio tick.
 */
export function WaveformVisualizer({
  state,
  audioLevel,
}: {
  state: VisualizerState;
  audioLevel: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(audioLevel);
  const smoothLevelRef = useRef(0);
  const stateRef = useRef<VisualizerState>(state);

  levelRef.current = audioLevel;
  stateRef.current = state;

  // Stable per-bar random seeds so the idle/flow shapes look organic but
  // deterministic between renders.
  const seeds = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (time: number) => {
      if (!running) return;
      const t = time / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const midY = h / 2;
      const current = stateRef.current;

      // Smooth the incoming audio level so bar motion feels fluid.
      const target = current === 'listening' || current === 'speaking' ? levelRef.current : 0;
      smoothLevelRef.current += (target - smoothLevelRef.current) * 0.25;
      const level = Math.max(0, Math.min(1, smoothLevelRef.current));

      ctx.clearRect(0, 0, w, h);

      const gap = 3;
      const barWidth = Math.max(2, (w - gap * (BAR_COUNT - 1)) / BAR_COUNT);
      const maxBarHeight = h * 0.82;

      // Gradient sweep only during synthesizing (shimmer effect).
      let shimmerOffset = 0;
      if (current === 'synthesizing') {
        shimmerOffset = ((t * 0.35) % 1) * (w + 120) - 60;
      }

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const x = i * (barWidth + gap);
        const centerFactor = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2); // 0..1, peaks at center

        let heightRatio: number;

        switch (current) {
          case 'listening':
          case 'speaking': {
            // Live audio: bell-shaped envelope × level × per-bar jitter.
            const jitter = 0.55 + 0.45 * Math.abs(seeds[i]);
            heightRatio = 0.08 + centerFactor * level * jitter * 1.15;
            break;
          }
          case 'processing':
          case 'synthesizing': {
            // Continuous travelling wave — AI is "thinking" even with no audio.
            const phase = t * (current === 'processing' ? 2.2 : 1.6) - i * 0.42;
            const wave = (Math.sin(phase) + Math.sin(phase * 0.53 + 1.7)) / 2; // -1..1
            heightRatio = 0.14 + centerFactor * (0.32 + 0.5 * Math.abs(wave));
            break;
          }
          default: {
            // Idle: slow breathing pulse.
            const breathe = (Math.sin(t * 1.4 - i * 0.18) + 1) / 2;
            heightRatio = 0.06 + centerFactor * 0.1 * (0.5 + breathe * 0.5);
          }
        }

        const barHeight = Math.max(barWidth, heightRatio * maxBarHeight);

        if (current === 'synthesizing') {
          // Shimmering highlight sweeping across the wave.
          const dist = Math.abs(x + barWidth / 2 - shimmerOffset);
          const glow = Math.max(0, 1 - dist / 90);
          const base = 148 + glow * 107;
          ctx.fillStyle = `rgb(${Math.round(base * 0.16)}, ${Math.round(base * 0.62)}, ${Math.round(base)})`;
        } else if (current === 'speaking') {
          ctx.fillStyle = '#38bdf8';
        } else if (current === 'processing') {
          ctx.fillStyle = '#22d3ee';
        } else {
          ctx.fillStyle = 'rgba(148, 197, 233, 0.75)';
        }

        roundedBar(ctx, x, midY - barHeight / 2, barWidth, barHeight, barWidth / 2);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [seeds]);

  return (
    <canvas
      ref={canvasRef}
      className={`aira-wave-canvas aira-wave-${state}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    />
  );
}

function roundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}
