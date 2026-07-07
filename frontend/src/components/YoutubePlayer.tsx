// Container ID used by useYoutubePlayer to mount the IFrame API player.
// The player is kept off-screen so audio plays without showing the video.
export const PLAYER_CONTAINER_ID = 'yt-player-container';

export default function YoutubePlayer() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
    >
      <div id={PLAYER_CONTAINER_ID} />
    </div>
  );
}
