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
  onEnded?: () => void;
  onError?: (code: number) => void;
}

export function useYoutubePlayer({ containerId, videoId, onEnded, onError }: UseYoutubePlayerProps): {
  playerReady: boolean;
  muted: boolean;
  unmute: () => void;
} {
  const playerRef = useRef<YTPlayer | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(true); // Start muted for autoplay compatibility
  const unmutedByUserRef = useRef<boolean>(false); // tracks whether user has explicitly unmuted

  // Init player
  useEffect(() => {
    if (!containerId) return;
    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;
      if (playerRef.current) {
        // Player already exists — just load the new video
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
              onEnded?.();
            }
          },
          onError: (event) => {
            console.error('[YT Player] error code:', event.data);
            onError?.(event.data);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, [containerId]); // Only re-init player when container changes

  // Load new video or stop when videoId changes (without re-creating the player)
  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    if (videoId) {
      playerRef.current.loadVideoById(videoId);
      // Re-apply unmute if user already unmuted — YouTube can reset mute on loadVideoById
      if (unmutedByUserRef.current) {
        playerRef.current.unMute();
        playerRef.current.setVolume(80);
      }
    } else {
      playerRef.current.stopVideo();
    }
  }, [videoId, playerReady]);

  const unmute = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.unMute();
      playerRef.current.setVolume(80);
      unmutedByUserRef.current = true;
      setMuted(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stopVideo();
    }
  }, []);

  return { playerReady, muted, unmute, stop };
}
