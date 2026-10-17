import { MOVIES } from './movieCatalog.js';

// The films are hosted on YouTube. Each card shows the film's poster until it is played, then swaps in the YouTube
// player in place, so the page does not load two players up front.
const list = document.querySelector('#movie-list');
const embedUrl = movie => `https://www.youtube-nocookie.com/embed/${movie.youtube}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=1`;
const watchUrl = movie => `https://www.youtube.com/watch?v=${movie.youtube}`;

function play(movie, frame) {
  if (frame.querySelector('iframe')) return;
  const player = document.createElement('iframe');
  player.src = embedUrl(movie); player.title = `${movie.title} · ${movie.english}`;
  player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  player.allowFullscreen = true; player.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.replaceChildren(player);
  const url = new URL(location.href); url.searchParams.set('watch', movie.id); history.replaceState(null, '', url);
}

for (const [index, movie] of MOVIES.entries()) {
  const article = document.createElement('article'); article.className = 'movie-card'; article.dataset.movie = movie.id;
  // Catalogue data is maintained locally; titles and descriptions are text nodes.
  const frame = document.createElement('div'); frame.className = 'player';
  const watch = document.createElement('button'); watch.className = 'poster'; watch.setAttribute('aria-label', `Play ${movie.title} — ${movie.english}`);
  const poster = document.createElement('img'); poster.src = movie.poster; poster.alt = `${movie.title}: a scene from the film`; poster.width = 1280; poster.height = 720;
  // The rendered posters are not in git, so a build without them falls back to YouTube's thumbnail.
  poster.onerror = () => { poster.onerror = null; poster.src = `https://i.ytimg.com/vi/${movie.youtube}/hqdefault.jpg`; };
  const icon = document.createElement('span'); icon.className = 'play-icon'; icon.innerHTML = '<b aria-hidden="true">▶</b> Play film';
  const time = document.createElement('span'); time.className = 'runtime'; time.textContent = `${Math.floor(movie.duration / 60)}:${String(movie.duration % 60).padStart(2, '0')}`;
  watch.append(poster, icon, time); watch.onclick = () => play(movie, frame); frame.append(watch);
  const meta = document.createElement('div'); meta.className = 'film-meta';
  const number = document.createElement('span'); number.textContent = `FILM ${String(index + 1).padStart(2, '0')}`;
  const theme = document.createElement('span'); theme.textContent = movie.theme.toUpperCase(); meta.append(number, theme);
  const title = document.createElement('h3'); title.textContent = movie.title;
  const english = document.createElement('span'); english.textContent = movie.english; title.append(english);
  const description = document.createElement('p'); description.textContent = movie.description;
  const links = document.createElement('p'); links.className = 'film-links';
  const youtube = document.createElement('a'); youtube.href = watchUrl(movie); youtube.target = '_blank'; youtube.rel = 'noopener'; youtube.textContent = 'Watch on YouTube ↗';
  const preview = document.createElement('a'); preview.href = movie.preview; preview.textContent = 'Interactive 3D preview';
  links.append(youtube, preview);
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
  article.append(frame, meta, title, description, links, prompt); list.append(article);
}

// ?watch=<film id> links straight to a film: scroll to its card and start its player.
const requested = MOVIES.find(movie => movie.id === new URL(location.href).searchParams.get('watch'));
if (requested) {
  const card = list.querySelector(`[data-movie="${requested.id}"]`);
  card.scrollIntoView({ block: 'center' }); play(requested, card.querySelector('.player'));
}
