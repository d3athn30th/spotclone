if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const DB_NAME = 'SpotCloneDB';
const STORE_NAME = 'tracks';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllTracks() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function saveTrack(track) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(track);
    tx.oncomplete = () => resolve();
  });
}

async function removeTrack(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
  });
}

const state = {
  tracks: [],
  currentIndex: -1,
  shuffle: false,
  repeat: false,
  currentObjectUrl: null
};

const audio = document.getElementById('audio-engine');

const hour = new Date().getHours();
document.getElementById('greeting').textContent =
  hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

function parseFilename(filename) {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const parts = clean.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: 'Локальный файл', title: clean };
}

const fileInput = document.getElementById('file-input');
document.getElementById('btn-import-files').onclick = () => fileInput.click();
document.getElementById('btn-import-top').onclick = () => fileInput.click();

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const meta = parseFilename(file.name);
    const track = {
      id: crypto.randomUUID(),
      title: meta.title,
      artist: meta.artist,
      type: 'blob',
      blob: file,
      addedAt: Date.now()
    };
    await saveTrack(track);
  }
  fileInput.value = '';
  await refreshTracks();
});

document.getElementById('btn-add-url').onclick = async () => {
  const url = prompt('Вставь прямую ссылку на MP3/M4A:');
  if (!url) return;
  const title = prompt('Название трека:', 'Стрим-трек') || 'Стрим-трек';
  const artist = prompt('Исполнитель:', 'Неизвестен') || 'Неизвестен';
  await saveTrack({
    id: crypto.randomUUID(),
    title,
    artist,
    type: 'url',
    url: url.trim(),
    addedAt: Date.now()
  });
  await refreshTracks();
};

function renderTrackList(container, list) {
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Пока пусто. Нажми «＋» или зайди в Медиатеку, чтобы загрузить музыку.</div>';
    return;
  }
  list.forEach((track) => {
    const realIndex = state.tracks.findIndex((t) => t.id === track.id);
    const el = document.createElement('div');
    el.className = 'track-item' + (realIndex === state.currentIndex ? ' playing' : '');
    el.innerHTML = `
      <div class="track-art">♪</div>
      <div class="track-meta">
        <div class="track-title">${escapeHtml(track.title)}</div>
        <div class="track-artist">${escapeHtml(track.artist)}</div>
      </div>
    `;
    el.onclick = () => playTrackAt(realIndex);
    container.appendChild(el);
  });
}

function renderQuickGrid() {
  const grid = document.getElementById('quick-grid');
  grid.innerHTML = '';
  state.tracks.slice(0, 6).forEach((track) => {
    const idx = state.tracks.findIndex((t) => t.id === track.id);
    const card = document.createElement('div');
    card.className = 'quick-card';
    card.innerHTML = `
      <div class="quick-card-art">♫</div>
      <div class="quick-card-title">${escapeHtml(track.title)}</div>
    `;
    card.onclick = () => playTrackAt(idx);
    grid.appendChild(card);
  });
}

async function refreshTracks() {
  state.tracks = await getAllTracks();
  state.tracks.sort((a, b) => b.addedAt - a.addedAt);
  renderQuickGrid();
  renderTrackList(document.getElementById('home-track-list'), state.tracks);
  renderTrackList(document.getElementById('library-track-list'), state.tracks);
  filterSearch();
}

function filterSearch() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = q
    ? state.tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    : state.tracks;
  renderTrackList(document.getElementById('search-results'), filtered);
}
document.getElementById('search-input').addEventListener('input', filterSearch);

function playTrackAt(index) {
  if (index < 0 || index >= state.tracks.length) return;
  state.currentIndex = index;
  const track = state.tracks[index];

  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = null;
  }

  if (track.type === 'blob') {
    state.currentObjectUrl = URL.createObjectURL(track.blob);
    audio.src = state.currentObjectUrl;
  } else {
    audio.src = track.url;
  }

  audio.play().catch(() => {});
  updatePlayerUI(track);
  updateMediaSession(track);
  refreshTracks();
}

function updatePlayerUI(track) {
  document.getElementById('mini-player').classList.remove('hidden');
  document.getElementById('mini-title').textContent = track.title;
  document.getElementById('mini-artist').textContent = track.artist;
  document.getElementById('full-title').textContent = track.title;
  document.getElementById('full-artist').textContent = track.artist;
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: 'SpotClone'
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', playPrev);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
}

function togglePlay() {
  if (state.currentIndex === -1 && state.tracks.length > 0) {
    playTrackAt(0);
    return;
  }
  if (audio.paused) audio.play();
  else audio.pause();
}

function playNext() {
  if (!state.tracks.length) return;
  if (state.shuffle) {
    const next = Math.floor(Math.random() * state.tracks.length);
    playTrackAt(next);
  } else {
    playTrackAt((state.currentIndex + 1) % state.tracks.length);
  }
}

function playPrev() {
  if (!state.tracks.length) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const prev = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
  playTrackAt(prev);
}

audio.addEventListener('play', () => {
  document.getElementById('mini-play-btn').textContent = '❚❚';
  document.getElementById('btn-play-pause').textContent = '❚❚';
});

audio.addEventListener('pause', () => {
  document.getElementById('mini-play-btn').textContent = '▶';
  document.getElementById('btn-play-pause').textContent = '▶';
});

audio.addEventListener('ended', () => {
  if (state.repeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    playNext();
  }
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('seek-slider').value = pct;
  document.getElementById('mini-progress-fill').style.width = `${pct}%`;
  document.getElementById('time-current').textContent = formatTime(audio.currentTime);
  document.getElementById('time-total').textContent = formatTime(audio.duration);
});

document.getElementById('seek-slider').addEventListener('input', (e) => {
  if (!audio.duration) return;
  audio.currentTime = (e.target.value / 100) * audio.duration;
});

document.getElementById('mini-play-btn').onclick = (e) => {
  e.stopPropagation();
  togglePlay();
};
document.getElementById('btn-play-pause').onclick = togglePlay;
document.getElementById('btn-next').onclick = playNext;
document.getElementById('btn-prev').onclick = playPrev;

document.getElementById('btn-shuffle').onclick = (e) => {
  state.shuffle = !state.shuffle;
  e.target.classList.toggle('active', state.shuffle);
};

document.getElementById('btn-repeat').onclick = (e) => {
  state.repeat = !state.repeat;
  e.target.classList.toggle('active', state.repeat);
};

const fullPlayer = document.getElementById('full-player');
document.getElementById('mini-open-full').onclick = () => fullPlayer.classList.add('open');
document.getElementById('btn-close-full').onclick = () => fullPlayer.classList.remove('open');

document.getElementById('btn-delete-track').onclick = async () => {
  if (state.currentIndex === -1) return;
  const track = state.tracks[state.currentIndex];
  await removeTrack(track.id);
  audio.pause();
  audio.src = '';
  state.currentIndex = -1;
  fullPlayer.classList.remove('open');
  document.getElementById('mini-player').classList.add('hidden');
  await refreshTracks();
};

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

refreshTracks();
