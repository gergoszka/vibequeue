#!/usr/bin/env node
'use strict';

const BASE = process.env.SMOKE_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

// Cookie jar: { [cookieName]: value }
function makeCookieJar() {
  let cookies = {};
  return {
    // Extract and store Set-Cookie headers from a response
    capture(response) {
      const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      for (const cookie of setCookie) {
        const [pair] = cookie.split(';');
        const [name, value] = pair.trim().split('=');
        cookies[name.trim()] = value ? value.trim() : '';
      }
    },
    // Produce Cookie header string
    header() {
      return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function req(method, path, body, jar) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar) headers['Cookie'] = jar.header();

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (jar) jar.capture(res);

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    await res.text(); // drain body
  }

  return { status: res.status, data };
}

function assert(name, condition, details = '') {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}${details ? ' — ' + details : ''}`);
    failed++;
  }
}

async function runSmoke() {
  console.log('VibeQueue smoke test\n');
  console.log(`Target: ${BASE}`);
  console.log(`TEST_MODE: ${process.env.TEST_MODE}\n`);

  const creator = makeCookieJar();
  const guest1 = makeCookieJar();
  const guest2 = makeCookieJar();

  // ---- Step 1: Create a room ----
  console.log('Step 1: Create room');
  const r1 = await req('POST', '/api/rooms', { tokenAllowance: 1, tokenRefreshIntervalMinutes: 30 }, creator);
  assert('POST /api/rooms → 201', r1.status === 201, `got ${r1.status}: ${JSON.stringify(r1.data)}`);
  assert('Response has roomCode', typeof r1.data?.roomCode === 'string' && r1.data.roomCode.length === 5);
  const roomCode = r1.data?.roomCode;

  if (!roomCode) { console.error('Cannot continue without roomCode'); process.exit(1); }

  // ---- Step 2: Guest 1 joins ----
  console.log('\nStep 2: Guest 1 joins');
  const r2 = await req('POST', '/api/rooms/join', { code: roomCode, displayName: 'Alice' }, guest1);
  assert('POST /api/rooms/join (guest1) → 200', r2.status === 200, `got ${r2.status}: ${JSON.stringify(r2.data)}`);
  assert('Guest1 tokensRemaining = 1 (tokenAllowance)', r2.data?.tokensRemaining === 1);
  const guest1Id = r2.data?.guestId;

  // ---- Step 3: Guest 2 joins ----
  console.log('\nStep 3: Guest 2 joins');
  const r3 = await req('POST', '/api/rooms/join', { code: roomCode, displayName: 'Bob' }, guest2);
  assert('POST /api/rooms/join (guest2) → 200', r3.status === 200, `got ${r3.status}`);
  assert('Guest2 tokensRemaining = 1', r3.data?.tokensRemaining === 1);

  // ---- Step 4: Guest 1 adds a song ----
  console.log('\nStep 4: Guest 1 adds a song');
  const r4 = await req('POST', `/api/rooms/${roomCode}/queue`, {
    youtubeVideoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    durationSeconds: 213,
  }, guest1);
  assert('Guest1 add song → 201', r4.status === 201, `got ${r4.status}: ${JSON.stringify(r4.data)}`);
  assert('First song status = playing', r4.data?.status === 'playing');
  const entry1Id = r4.data?.id;

  // ---- Step 5: Guest 1 tries to add another song with 0 tokens ----
  console.log('\nStep 5: Guest 1 tries to add with 0 tokens');
  const r5 = await req('POST', `/api/rooms/${roomCode}/queue`, {
    youtubeVideoId: 'oHg5SJYRHA0',
    title: 'RickRoll v2',
    durationSeconds: 200,
  }, guest1);
  assert('Guest1 add with 0 tokens → 402', r5.status === 402, `got ${r5.status}: ${JSON.stringify(r5.data)}`);

  // ---- Step 6: Guest 2 adds a song ----
  console.log('\nStep 6: Guest 2 adds a song');
  const r6 = await req('POST', `/api/rooms/${roomCode}/queue`, {
    youtubeVideoId: 'oHg5SJYRHA0',
    title: 'Rick Astley - Together Forever',
    durationSeconds: 194,
  }, guest2);
  assert('Guest2 add song → 201', r6.status === 201, `got ${r6.status}: ${JSON.stringify(r6.data)}`);
  assert('Second song status = pending', r6.data?.status === 'pending');
  const entry2Id = r6.data?.id;

  // ---- Step 7: Fetch queue ----
  console.log('\nStep 7: Fetch queue');
  const r7 = await req('GET', `/api/rooms/${roomCode}/queue`, null, creator);
  assert('GET /queue → 200', r7.status === 200, `got ${r7.status}`);
  const entries = r7.data?.entries || [];
  assert('Queue has 2 entries', entries.length === 2, `got ${entries.length}`);
  assert('One playing, one pending', entries.some(e => e.status === 'playing') && entries.some(e => e.status === 'pending'));

  // ---- Step 8: Creator advances queue ----
  console.log('\nStep 8: Creator advances queue');
  const r8 = await req('POST', `/api/rooms/${roomCode}/queue/advance`, {}, creator);
  assert('POST /queue/advance → 200', r8.status === 200, `got ${r8.status}: ${JSON.stringify(r8.data)}`);
  assert('nowPlaying is the second song', r8.data?.nowPlaying?.id === entry2Id, `got ${r8.data?.nowPlaying?.id}`);

  // ---- Step 9: Creator removes the now-playing song ----
  console.log('\nStep 9: Creator removes song 2');
  const r9 = await req('DELETE', `/api/rooms/${roomCode}/queue/${entry2Id}`, null, creator);
  assert('DELETE /queue/:id (creator) → 204', r9.status === 204, `got ${r9.status}`);

  // ---- Step 10: Verify room is still active ----
  console.log('\nStep 10: Verify room still active');
  const r10 = await req('GET', `/api/rooms/${roomCode}`, null, creator);
  assert('GET /api/rooms/:code → 200', r10.status === 200, `got ${r10.status}`);
  assert('Room is active', r10.data?.isActive === 1 || r10.data?.isActive === true);

  // ---- Step 11: Creator ends the room ----
  console.log('\nStep 11: Creator ends room');
  const r11 = await req('DELETE', `/api/rooms/${roomCode}`, null, creator);
  assert('DELETE /api/rooms/:code → 204', r11.status === 204, `got ${r11.status}: ${JSON.stringify(r11.data)}`);

  // ---- Step 12: Verify room is now inactive ----
  console.log('\nStep 12: Verify room now inactive');
  const r12 = await req('GET', `/api/rooms/${roomCode}`, null, creator);
  assert('Room is inactive (404 or isActive=false)', r12.status === 404 || r12.data?.isActive === 0 || r12.data?.isActive === false);

  // ---- Summary ----
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\nSmoke test FAILED with ${failed} failures`);
    process.exit(1);
  } else {
    console.log('\nAll smoke tests PASSED');
    process.exit(0);
  }
}

runSmoke().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
