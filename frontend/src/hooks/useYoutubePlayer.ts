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

interface UseYoutubePlayerProps {
  containerId: string;
  videoId: string | null;
  trackTitle?: string;
  trackThumbnailUrl?: string | null;
  onEnded?: () => void;
  onError?: (code: number) => void;
}

export function useYoutubePlayer({ containerId, videoId, trackTitle, trackThumbnailUrl, onEnded, onError }: UseYoutubePlayerProps): {
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
  const [paused, setPaused] = useState<boolean>(false);
  const unmutedByUserRef = useRef<boolean>(false);
  const wasPlayingRef = useRef<boolean>(false);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // --- Silent Web Audio keep-alive ---
  // A near-silent oscillator prevents Android from treating the page as idle audio.
  // Must be started inside a user-gesture handler (the unmute button).
  const silentAudioRef = useRef<AudioContext | null>(null);
  const startSilentAudio = useCallback(() => {
    if (silentAudioRef.current) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001; // inaudible but non-zero so the browser doesn't optimise it away
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    silentAudioRef.current = ctx;
  }, []);

  // Init player
  useEffect(() => {
    if (!containerId) return;
    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;
      if (playerRef.current) {
        if (videoId) playerRef.current.loadVideoById(videoId);
        return;
      }

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
        },
        events: {
          onReady: () => { setPlayerReady(true); },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              setPaused(false);
              wasPlayingRef.current = false;
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
              onEndedRef.current?.();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
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
      setPaused(false);
      playerRef.current.loadVideoById(videoId);
      if (unmutedByUserRef.current) {
        playerRef.current.unMute();
        playerRef.current.setVolume(80);
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
      playerRef.current?.pauseVideo();
    });
    // Prevent the next/previous buttons from doing anything unexpected
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
  }, [trackTitle, trackThumbnailUrl]);

  // --- Page Visibility auto-resume ---
  // If the browser still pauses playback when backgrounded, resume automatically on return.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wasPlayingRef.current && playerRef.current) {
        setTimeout(() => {
          try { playerRef.current?.playVideo(); } catch { /* ignore */ }
        }, 300);
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
