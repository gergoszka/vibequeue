import { useEffect, useRef, useState, useCallback } from 'react';

// Loads the YouTube IFrame API script once globally
let apiLoaded = false;
let apiLoadCallbacks: Array<() => void> = [];

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    if (window.YT && window.YT.Player) { apiLoaded = true; resolve(); return; }
    apiLoadCallbacks.push(resolve);
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      apiLoadCallbacks.forEach(cb => cb());
      apiLoadCallbacks = [];
    };
  });
}

// Build a 1-second silent WAV as a blob URL (computed once).
// Chrome uses an actual <audio> element — not a Web Audio oscillator — to acquire
// Android AudioFocus and protect the page from the frozen lifecycle state when
// the browser is backgrounded. This blob is the src for that element.
let silentWavUrl: string | null = null;
function getSilentWavUrl(): string {
  if (silentWavUrl) return silentWavUrl;
  const rate = 8000, samples = rate;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 0x80); // 0x80 = silence in 8-bit unsigned PCM
  silentWavUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentWavUrl;
}

interface UseYoutubePlayerProps {
  containerId: string;
  videoId: string | null;
  startedPlayingAt?: number | null;
  trackTitle?: string;
  trackThumbnailUrl?: string | null;
  onEnded?: () => void;
  onError?: (code: number) => void;
}

export function useYoutubePlayer({ containerId, videoId, startedPlayingAt, trackTitle, trackThumbnailUrl, onEnded, onError }: UseYoutubePlayerProps): {
  playerReady: boolean;
  muted: boolean;
  paused: boolean;
  unmute: () => void;
  stop: () => void;
  togglePause: () => void;
} {
  const playerRef = useRef<YTPlayer | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(true);
  // Start paused if a song is already in progress (host returning to the page).
  const [paused, setPaused] = useState<boolean>(!!startedPlayingAt);
  const unmutedByUserRef = useRef<boolean>(false);
  const wasPlayingRef = useRef<boolean>(false);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const startedPlayingAtRef = useRef(startedPlayingAt);
  const isFirstVideoLoadRef = useRef(true);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { startedPlayingAtRef.current = startedPlayingAt; }, [startedPlayingAt]);

  function getStartSeconds(): number {
    const sat = startedPlayingAtRef.current;
    if (!sat) return 0;
    return Math.max(0, Math.floor((Date.now() - sat) / 1000));
  }

  // --- Background audio keep-alive ---
  // Two layers so Chrome on Android doesn't freeze the page when minimized:
  //
  //  1. <audio> element (PRIMARY): Chrome uses a real <audio> element to acquire
  //     Android AudioFocus. Without it, the page can enter the frozen lifecycle
  //     state on app-switch even though the YouTube IFrame is playing.
  //
  //  2. Web Audio oscillator (SECONDARY): inaudible tone that keeps the
  //     AudioContext alive on browsers that check Web Audio activity.
  //
  // Both layers run whenever a song is playing, including the gap between songs
  // (ENDED → next song loads). They are paused only when the user explicitly
  // pauses or the queue is empty.
  //
  // Must be started inside a user-gesture handler (the unmute button).
  const silentAudioRef = useRef<AudioContext | null>(null);
  const silentAudioElRef = useRef<HTMLAudioElement | null>(null);

  const startSilentAudio = useCallback(() => {
    if (silentAudioRef.current) return;

    // Layer 1 — looping <audio> element
    const el = document.createElement('audio');
    el.src = getSilentWavUrl();
    el.loop = true;
    el.play().catch(() => {});
    silentAudioElRef.current = el;

    // Layer 2 — Web Audio oscillator
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001; // inaudible but non-zero
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    silentAudioRef.current = ctx;
  }, []);

  // Pause/resume both keep-alive layers in sync with playback state.
  useEffect(() => {
    const ctx = silentAudioRef.current;
    const el = silentAudioElRef.current;
    if (!ctx && !el) return;
    if (!videoId || paused) {
      ctx?.suspend().catch(() => {});
      el?.pause();
    } else {
      ctx?.resume().catch(() => {});
      if (el?.paused) el.play().catch(() => {});
    }
  }, [videoId, paused]);

  // Init player
  useEffect(() => {
    if (!containerId) return;
    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;
      if (playerRef.current) {
        if (videoId) playerRef.current.loadVideoById({ videoId, startSeconds: getStartSeconds() });
        return;
      }

      const initStartSec = getStartSeconds();
      playerRef.current = new window.YT.Player(containerId, {
        height: '180',
        width: '320',
        videoId: videoId ?? '',
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          ...(initStartSec > 0 && { start: initStartSec }),
        },
        events: {
          onReady: () => { setPlayerReady(true); },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              setPaused(false);
              wasPlayingRef.current = false;
              // Keep the media session alive ('paused' not 'none') so the browser
              // doesn't aggressively suspend the page before the queue/advance fetch completes.
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
              onEndedRef.current?.();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (document.hidden && wasPlayingRef.current) {
                // The page is backgrounded and something paused us — either Chrome
                // dispatching a MediaSession pause action or YouTube's own hide-detection.
                // Resume immediately so background audio keeps flowing.
                setTimeout(() => {
                  try { playerRef.current?.playVideo(); } catch { /* ignore */ }
                }, 300);
                return;
              }
              setPaused(true);
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              setPaused(false);
              wasPlayingRef.current = true;
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }
          },
          onError: (event) => {
            console.error('[YT Player] error code:', event.data);
            onErrorRef.current?.(event.data);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, [containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load new video when videoId changes
  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    if (videoId) {
      const startSec = getStartSeconds();
      // If this is the first video loaded by this player instance and the song is already
      // in progress, the host returned to the page — cue at the correct position without
      // autoplaying so they can resume when ready.
      const isReturn = isFirstVideoLoadRef.current && startSec > 0;
      isFirstVideoLoadRef.current = false;

      if (isReturn) {
        playerRef.current.cueVideoById({ videoId, startSeconds: startSec });
        setPaused(true);
        wasPlayingRef.current = false;
      } else {
        setPaused(false);
        playerRef.current.loadVideoById({ videoId, startSeconds: startSec });
        if (unmutedByUserRef.current) {
          playerRef.current.unMute();
          playerRef.current.setVolume(80);
        }
      }
    } else {
      setPaused(false);
      playerRef.current.stopVideo();
    }
  }, [videoId, playerReady]);

  // --- MediaSession API ---
  // Tells Android this page is actively playing media so Chrome allows background playback.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle ?? 'Now Playing',
      artwork: trackThumbnailUrl
        ? [{ src: trackThumbnailUrl, sizes: '320x180', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.setActionHandler('play', () => {
      playerRef.current?.playVideo();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      // When the page is hidden, this action is dispatched by the system (Chrome
      // backgrounding / Android AudioFocus change), not by the user. Ignoring it
      // keeps music playing through app switches.
      if (document.hidden) return;
      playerRef.current?.pauseVideo();
    });
    // Prevent the next/previous buttons from doing anything unexpected
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
  }, [trackTitle, trackThumbnailUrl]);

  // --- Page Visibility handler ---
  // When the screen is unlocked / tab made visible, catch any state the player
  // entered while the page was hidden.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !playerRef.current) return;
      const state = playerRef.current.getPlayerState();
      if (state === window.YT.PlayerState.ENDED) {
        // Song ended while screen was locked — the ENDED event may not have fired
        // (browser throttles postMessage when hidden) so advance the queue now.
        wasPlayingRef.current = false;
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        onEndedRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const unmute = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.unMute();
      playerRef.current.setVolume(80);
      unmutedByUserRef.current = true;
      setMuted(false);
      startSilentAudio(); // start keep-alive inside the user gesture
    }
  }, [startSilentAudio]);

  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stopVideo();
    }
  }, []);

  const togglePause = useCallback(() => {
    if (!playerRef.current) return;
    const state = playerRef.current.getPlayerState();
    if (state === window.YT.PlayerState.PLAYING) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }, []);

  return { playerReady, muted, paused, unmute, stop, togglePause };
}
