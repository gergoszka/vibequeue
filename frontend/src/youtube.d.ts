interface YTPlayerVars {
  autoplay?: 0 | 1;
  mute?: 0 | 1;
  controls?: 0 | 1;
  rel?: 0 | 1;
  modestbranding?: 0 | 1;
}

interface YTPlayerOptions {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    onError?: (event: { data: number; target: YTPlayer }) => void;
  };
}

interface YTPlayer {
  loadVideoById(videoId: string): void;
  stopVideo(): void;
  unMute(): void;
  setVolume(volume: number): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YT {
  Player: new (containerId: string, options: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

interface Window {
  YT: YT;
  onYouTubeIframeAPIReady: () => void;
}
