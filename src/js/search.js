/**
 * Accessible city search (ARIA combobox + listbox) with debounced
 * suggestions, keyboard navigation and recent searches.
 */
import { searchPlaces } from './api.js';
import { esc } from './format.js';

export function createSearch({ root, input, list, live, onSelect, getRecents }) {
  let items = [];
  let active = -1;
  let shownQuery = null;
  let timer = 0;
  let ctrl = null;
  let seq = 0;

  const isOpen = () => !list.hidden;

  function open() {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function setActive(i) {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    const el = i >= 0 ? list.querySelector(`#search-opt-${i}`) : null;
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render(results, { heading = '', message = '', query = null } = {}) {
    items = results;
    shownQuery = query;
    let html = heading ? `<li class="search-head" role="presentation">${esc(heading)}</li>` : '';
    html += results.map((p, i) =>
      `<li role="option" id="search-opt-${i}" data-index="${i}" aria-selected="false">` +
      `<span class="opt-name">${esc(p.name)}</span>` +
      `<span class="opt-meta">${esc([p.admin1, p.country].filter(Boolean).join(', '))}</span></li>`).join('');
    if (message) html += `<li class="search-msg" role="presentation">${esc(message)}</li>`;
    list.innerHTML = html;
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (html) open();
    else close();
    live.textContent = message || (results.length ? `${results.length} suggestion${results.length > 1 ? 's' : ''}. Use the arrow keys to choose.` : '');
  }

  async function run(query, { pickFirst = false } = {}) {
    clearTimeout(timer);
    timer = 0;
    ctrl?.abort();
    ctrl = new AbortController();
    const mine = ++seq;
    if (!pickFirst) render([], { message: 'Searching…' });
    try {
      const results = await searchPlaces(query, { signal: ctrl.signal });
      if (mine !== seq) return;
      if (pickFirst && results[0]) {
        choose(results[0]);
        return;
      }
      render(results, { query, message: results.length ? '' : `No places found for “${query}”.` });
    } catch (err) {
      if (mine !== seq || err?.name === 'AbortError') return;
      render([], { message: err?.message || 'Search failed. Please try again.' });
    }
  }

  function choose(place) {
    if (!place) return;
    seq++;
    ctrl?.abort();
    clearTimeout(timer);
    close();
    input.value = '';
    input.blur();
    onSelect({ ...place, source: place.source === 'geo' ? 'geo' : 'search' });
  }

  function showRecents() {
    const recents = getRecents();
    if (recents.length) render(recents, { heading: 'Recent' });
    else close();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    timer = 0;
    if (q.length < 2) {
      seq++;
      ctrl?.abort();
      if (q) close();
      else showRecents();
      return;
    }
    timer = setTimeout(() => run(q), 250);
  });

  input.addEventListener('focus', () => {
    if (!input.value.trim()) showRecents();
  });

  input.addEventListener('keydown', e => {
    const q = input.value.trim();
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!isOpen() || !items.length) {
          if (q.length >= 2) run(q);
          else showRecents();
          return;
        }
        const n = items.length;
        setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (isOpen() && active >= 0) choose(items[active]);
        else if (q.length >= 2 && shownQuery === q && items.length && !timer) choose(items[0]);
        else if (q.length >= 2) run(q, { pickFirst: true });
        break;
      }
      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          close();
        } else if (input.value) {
          input.value = '';
        }
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  });

  // Keep focus in the input while clicking a suggestion.
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const option = e.target.closest('[role="option"]');
    if (option) choose(items[Number(option.dataset.index)]);
  });
  list.addEventListener('mousemove', e => {
    const option = e.target.closest('[role="option"]');
    if (option && Number(option.dataset.index) !== active) setActive(Number(option.dataset.index));
  });

  document.addEventListener('pointerdown', e => {
    if (!root.contains(e.target)) close();
  });

  return { close, focus: () => input.focus() };
}
