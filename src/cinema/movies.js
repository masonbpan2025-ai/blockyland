import { MOVIES } from './movieCatalog.js';

const list = document.querySelector('#movie-list'), dialog = document.querySelector('#theater'), player = document.querySelector('#movie-player');
let opener;
for (const [index, movie] of MOVIES.entries()) {
  const article = document.createElement('article'); article.className = 'movie-card'; article.dataset.movie = movie.id;
  // Catalogue data is maintained locally; titles and descriptions are text nodes.
  const watch = document.createElement('button'); watch.className = 'poster'; watch.setAttribute('aria-label', `Watch ${movie.title} — ${movie.english}`);
  const poster = document.createElement('img'); poster.src = movie.poster; poster.alt = `${movie.title}: a scene from the film`; poster.width = 1280; poster.height = 720;
  watch.append(poster);
  const play = document.createElement('span'); play.className = 'play-icon'; play.innerHTML = '<b aria-hidden="true">▶</b> Watch film';
  const time = document.createElement('span'); time.className = 'runtime'; time.textContent = `${Math.floor(movie.duration / 60)}:${String(movie.duration % 60).padStart(2, '0')}`; watch.append(play, time);
  const meta = document.createElement('div'); meta.className = 'film-meta';
  const number = document.createElement('span'); number.textContent = `FILM ${String(index + 1).padStart(2, '0')}`;
  const theme = document.createElement('span'); theme.textContent = movie.theme.toUpperCase(); meta.append(number, theme);
  const title = document.createElement('h3'); title.textContent = movie.title;
  const english = document.createElement('span'); english.textContent = movie.english; title.append(english);
  const description = document.createElement('p'); description.textContent = movie.description;
  watch.onclick = () => showMovie(movie, watch);
  // The prompt that could produce this film, collapsed by default.
  const prompt = document.createElement('details'); prompt.className = 'prompt';
  const summary = document.createElement('summary'); summary.textContent = 'See the prompt';
  const intro = document.createElement('p'); intro.className = 'prompt-intro'; intro.textContent = 'A prompt that could produce this film in Blockyland:';
  const text = document.createElement('pre'); text.textContent = movie.prompt;
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy-prompt'; copy.textContent = 'Copy prompt';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(movie.prompt); copy.textContent = 'Copied'; }
    catch { getSelection().selectAllChildren(text); copy.textContent = 'Selected: press Ctrl+C'; }
    setTimeout(() => { copy.textContent = 'Copy prompt'; }, 2200);
  };
  prompt.append(summary, intro, text, copy);
  article.append(watch, meta, title, description, prompt); list.append(article);
}
function showMovie(movie, button) {
  opener = button;
  player.pause(); player.src = movie.video; player.poster = movie.poster;
  document.querySelector('#watch-title').textContent = `${movie.title} · ${movie.english}`;
  document.querySelector('#watch-note').textContent = movie.note;
  document.querySelector('#download-movie').href = movie.video;
  document.querySelector('#live-preview').href = movie.preview;
  document.querySelector('#player-status').hidden = true;
  if (!dialog.open) dialog.showModal();
  const url = new URL(location.href); url.searchParams.set('watch', movie.id); history.replaceState(null, '', url);
  player.play().catch(() => { /* Native controls remain available when autoplay is restricted. */ });
}
function closeMovie() {
  player.pause(); player.removeAttribute('src'); player.load();
  const url = new URL(location.href); url.searchParams.delete('watch'); history.replaceState(null, '', url);
  if (dialog.open) dialog.close();
}
document.querySelector('#close-theater').onclick = closeMovie;
dialog.addEventListener('close', () => {
  player.pause(); player.removeAttribute('src'); player.load();
  const url = new URL(location.href); url.searchParams.delete('watch'); history.replaceState(null, '', url);
  opener?.focus();
});
dialog.addEventListener('cancel', () => {
  player.pause(); player.removeAttribute('src'); player.load();
  const url = new URL(location.href); url.searchParams.delete('watch'); history.replaceState(null, '', url);
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeMovie(); } });
player.addEventListener('error', () => { const s = document.querySelector('#player-status'); s.textContent = 'This film could not be loaded. Please close it and try again.'; s.hidden = false; });
const requested = MOVIES.find(movie => movie.id === new URL(location.href).searchParams.get('watch'));
if (requested) showMovie(requested, list.querySelector(`[data-movie="${requested.id}"] button.poster`));
