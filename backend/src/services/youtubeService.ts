const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_PLAYLIST_ITEMS_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';

interface VideoSearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string;
  liveBroadcastContent: string;
}

interface VideoDetails {
  durationSeconds: number;
  duration: string;
}

/**
 * Parse an ISO 8601 duration string (e.g. "PT3M45S") to total seconds.
 * Returns 0 for unrecognised formats.
 */
export function parseIso8601Duration(duration: string): number {
  if (!duration || typeof duration !== 'string') return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
}

/**
 * Fetch up to `maxPages` pages (50 items each) from a YouTube playlist.
 * Pass `startPageToken` to continue from a previous fetch.
 * Returns the items and the next page token (undefined if no more pages).
 */
export async function getPlaylistItems(
  playlistId: string,
  accessToken: string,
  startPageToken?: string,
  maxPages = 2
): Promise<{ items: PlaylistItem[]; nextPageToken: string | undefined }> {
  const items: PlaylistItem[] = [];
  let pageToken: string | undefined = startPageToken;
  let pages = 0;

  do {
    pages++;
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: '50',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`${YOUTUBE_PLAYLIST_ITEMS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errObj = data.error as Record<string, unknown> | undefined;
      const detail =
        (errObj?.message as string | undefined) || response.statusText;
      throw new Error(`Playlist fetch failed: ${detail}`);
    }

    const rawItems = (data.items as Array<Record<string, unknown>>) || [];
    for (const item of rawItems) {
      const snippet = item.snippet as Record<string, unknown> | undefined;
      const resourceId = snippet?.resourceId as Record<string, unknown> | undefined;
      const videoId = resourceId?.videoId as string | undefined;
      const title = snippet?.title as string | undefined;

      if (!videoId || !title || title === 'Deleted video' || title === 'Private video') continue;

      const thumbnails = snippet?.thumbnails as Record<string, unknown> | undefined;
      const medium = thumbnails?.medium as Record<string, unknown> | undefined;
      const defaultThumb = thumbnails?.default as Record<string, unknown> | undefined;
      const thumbnailUrl =
        (medium?.url as string | undefined) ||
        (defaultThumb?.url as string | undefined) ||
        null;

      items.push({ videoId, title, thumbnailUrl });
    }

    pageToken = data.nextPageToken as string | undefined;
  } while (pageToken && pages < maxPages);

  return { items, nextPageToken: pageToken };
}

/**
 * Search YouTube for music videos matching a query.
 */
export async function searchVideos(query: string, accessToken: string): Promise<VideoSearchResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    maxResults: '10',
    q: query,
  });

  const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errObj = data.error as Record<string, unknown> | undefined;
    const errorsArr = errObj?.errors as Array<Record<string, unknown>> | undefined;
    const detail =
      (errObj?.message as string | undefined) ||
      (errorsArr?.[0]?.message as string | undefined) ||
      response.statusText;
    throw new Error(`YouTube search failed: ${detail}`);
  }

  const items = (data.items as Array<Record<string, unknown>>) || [];
  return items.map((item) => {
    const id = item.id as Record<string, unknown> | undefined;
    const snippet = item.snippet as Record<string, unknown> | undefined;
    const thumbnails = snippet?.thumbnails as Record<string, unknown> | undefined;
    const medium = thumbnails?.medium as Record<string, unknown> | undefined;
    const defaultThumb = thumbnails?.default as Record<string, unknown> | undefined;
    return {
      videoId: (id?.videoId as string | undefined) ?? '',
      title: (snippet?.title as string | undefined) ?? '',
      thumbnailUrl: (medium?.url as string | undefined) || (defaultThumb?.url as string | undefined) || null,
      channelTitle: (snippet?.channelTitle as string | undefined) ?? '',
      liveBroadcastContent: (snippet?.liveBroadcastContent as string | undefined) ?? 'none',
    };
  });
}

/**
 * Fetch content details for a batch of video IDs.
 */
export async function getVideoDetails(
  videoIds: string[],
  accessToken: string
): Promise<Map<string, VideoDetails>> {
  const params = new URLSearchParams({
    part: 'contentDetails,snippet',
    id: videoIds.join(','),
  });

  const response = await fetch(`${YOUTUBE_VIDEOS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errObj = data.error as Record<string, unknown> | undefined;
    const errorsArr = errObj?.errors as Array<Record<string, unknown>> | undefined;
    const detail =
      (errObj?.message as string | undefined) ||
      (errorsArr?.[0]?.message as string | undefined) ||
      response.statusText;
    throw new Error(`YouTube video details failed: ${detail}`);
  }

  const detailsMap = new Map<string, VideoDetails>();
  const items = (data.items as Array<Record<string, unknown>>) || [];

  for (const item of items) {
    const contentDetails = item.contentDetails as Record<string, unknown> | undefined;
    const rawDuration = (contentDetails?.duration as string | undefined) ?? '';
    detailsMap.set(item.id as string, {
      durationSeconds: parseIso8601Duration(rawDuration),
      duration: rawDuration,
    });
  }

  return detailsMap;
}

/**
 * Search for music videos and enrich each result with duration.
 * Filters out live streams.
 */
export async function searchWithDetails(
  query: string,
  accessToken: string
): Promise<
  Array<{
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    channelTitle: string;
    durationSeconds: number;
  }>
> {
  const searchResults = await searchVideos(query, accessToken);

  if (searchResults.length === 0) {
    return [];
  }

  const videoIds = searchResults.map((r) => r.videoId).filter(Boolean);
  const detailsMap = await getVideoDetails(videoIds, accessToken);

  const results: Array<{
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    channelTitle: string;
    durationSeconds: number;
  }> = [];

  for (const result of searchResults) {
    // Filter out live streams by liveBroadcastContent flag
    if (result.liveBroadcastContent === 'live') {
      continue;
    }

    const details = detailsMap.get(result.videoId);

    // Filter out live streams by duration === 'P0D' (YouTube marks live as zero-length)
    if (details && details.duration === 'P0D') {
      continue;
    }

    results.push({
      videoId: result.videoId,
      title: result.title,
      thumbnailUrl: result.thumbnailUrl,
      channelTitle: result.channelTitle,
      durationSeconds: details ? details.durationSeconds : 0,
    });
  }

  return results;
}
