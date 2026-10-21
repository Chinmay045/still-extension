// Suggestions for the "Add a site" boxes: popular distracting sites plus the sites open in
// your tabs right now. Type a few letters ("insta", "you", "net") and pick one.
import { normalizeDomain } from './lib.js';

const POPULAR = [
  ['youtube.com', 'YouTube', 'yt'], ['instagram.com', 'Instagram', 'insta ig'], ['x.com', 'X', 'twitter'],
  ['twitter.com', 'Twitter'], ['facebook.com', 'Facebook', 'fb meta'], ['reddit.com', 'Reddit'],
  ['linkedin.com', 'LinkedIn'], ['netflix.com', 'Netflix'], ['primevideo.com', 'Prime Video', 'amazon prime'],
  ['hotstar.com', 'Disney+ Hotstar', 'jiohotstar'], ['jiocinema.com', 'JioCinema'], ['sonyliv.com', 'SonyLIV'],
  ['zee5.com', 'ZEE5'], ['mxplayer.in', 'MX Player'], ['twitch.tv', 'Twitch'], ['tiktok.com', 'TikTok'],
  ['snapchat.com', 'Snapchat'], ['pinterest.com', 'Pinterest'], ['threads.net', 'Threads'],
  ['tumblr.com', 'Tumblr'], ['quora.com', 'Quora'], ['discord.com', 'Discord'],
  ['whatsapp.com', 'WhatsApp Web', 'web.whatsapp'], ['telegram.org', 'Telegram Web'],
  ['sharechat.com', 'ShareChat'], ['9gag.com', '9GAG'], ['imgur.com', 'Imgur'],
  ['amazon.in', 'Amazon India', 'shopping'], ['amazon.com', 'Amazon'], ['flipkart.com', 'Flipkart', 'shopping'],
  ['myntra.com', 'Myntra', 'shopping'], ['ajio.com', 'AJIO'], ['meesho.com', 'Meesho'], ['nykaa.com', 'Nykaa'],
  ['swiggy.com', 'Swiggy', 'food'], ['zomato.com', 'Zomato', 'food'], ['bookmyshow.com', 'BookMyShow'],
  ['cricbuzz.com', 'Cricbuzz', 'cricket'], ['espncricinfo.com', 'ESPNcricinfo', 'cricket'],
  ['dream11.com', 'Dream11'], ['inshorts.com', 'Inshorts', 'news'], ['news.google.com', 'Google News', 'news'],
  ['ndtv.com', 'NDTV', 'news'], ['indiatimes.com', 'Times of India', 'toi news'], ['moneycontrol.com', 'Moneycontrol'],
  ['kite.zerodha.com', 'Zerodha Kite', 'stocks trading'], ['groww.in', 'Groww', 'stocks'],
  ['news.ycombinator.com', 'Hacker News', 'hn'], ['medium.com', 'Medium'], ['substack.com', 'Substack'],
  ['wikipedia.org', 'Wikipedia', 'wiki'], ['imdb.com', 'IMDb'], ['spotify.com', 'Spotify', 'music'],
  ['music.youtube.com', 'YouTube Music', 'music'], ['chess.com', 'Chess.com'], ['lichess.org', 'Lichess'],
  ['roblox.com', 'Roblox', 'games'], ['steampowered.com', 'Steam', 'games'], ['epicgames.com', 'Epic Games', 'games'],
  ['tinder.com', 'Tinder'], ['bumble.com', 'Bumble'], ['olx.in', 'OLX'], ['google.com', 'Google Search'],
  ['mail.google.com', 'Gmail', 'email'], ['outlook.live.com', 'Outlook', 'email'], ['chatgpt.com', 'ChatGPT']
].map(([d, name, alias]) => ({ d, name, words: (name + ' ' + d + ' ' + (alias || '')).toLowerCase() }));

const MAX = 6;

async function openTabSites() {
  try {
    const tabs = await chrome.tabs.query({});
    const seen = new Set();
    return tabs.map((t) => normalizeDomain(t.url || '')).filter((d) => d && !seen.has(d) && seen.add(d))
      .map((d) => ({ d, name: 'Open in a tab', words: d, tab: true }));
  } catch (e) {
    return [];
  }
}

// Best first: the site's address starts with what you typed, then its name or a nickname
// does, then it appears anywhere. Sites already on the list come back marked as blocked.
function matches(q, list, blocked) {
  const tiers = [[], [], []];
  for (const s of list) {
    const tier = s.d.startsWith(q) ? 0 : s.words.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : s.words.includes(q) ? 2 : -1;
    if (tier >= 0) tiers[tier].push(blocked.includes(s.d) ? Object.assign({}, s, { blocked: true }) : s);
  }
  return tiers.flat();
}

// input: the text box. getBlocked: () => current list. onPick: (domain) => adds it.
export function attachSuggest(input, getBlocked, onPick) {
  const box = document.createElement('ul');
  box.className = 'suggest';
  box.id = input.id + '-suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  input.parentElement.classList.add('has-suggest');
  input.parentElement.appendChild(box);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', box.id);
  input.setAttribute('aria-expanded', 'false');

  let items = [];
  let active = -1;
  let tabSites = [];

  function close() {
    box.hidden = true;
    items = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function paint() {
    box.innerHTML = items.map((s, i) => `<li role="option" id="${box.id}-${i}" data-i="${i}" aria-selected="${i === active}"${s.blocked ? ' aria-disabled="true" class="sg-done"' : ''}>
      <span class="sg-mark" aria-hidden="true">${s.d[0].toUpperCase()}</span>
      <span class="sg-text"><b>${s.d}</b><small>${s.blocked ? 'Already blocked' : s.custom ? 'Add this site' : s.name}</small></span>
    </li>`).join('');
    box.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    if (active >= 0) input.setAttribute('aria-activedescendant', box.id + '-' + active);
    else input.removeAttribute('aria-activedescendant');
  }

  function update() {
    const raw = input.value.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    if (!raw) { close(); return; }
    const blocked = getBlocked();
    const pool = tabSites.filter((t) => !POPULAR.some((p) => p.d === t.d)).concat(POPULAR);
    items = matches(raw, pool, blocked).slice(0, MAX);
    // A full address they typed (or a bare name nothing matched, "mycompany" -> mycompany.com).
    const typed = normalizeDomain(raw) || (!items.length && /^[a-z0-9-]+$/.test(raw) ? raw + '.com' : '');
    if (typed && !blocked.includes(typed) && !items.some((s) => s.d === typed)) {
      items = items.slice(0, MAX - 1).concat([{ d: typed, custom: true }]);
    }
    active = items.findIndex((s) => !s.blocked);
    paint();
  }

  function pick(i) {
    const s = items[i];
    if (!s || s.blocked) return;
    close();
    input.value = '';
    onPick(s.d);
  }

  input.addEventListener('focus', async () => { tabSites = await openTabSites(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      for (let n = 0; n < items.length; n++) {
        active = (active + step + items.length) % items.length;
        if (!items[active].blocked) break;
      }
      paint();
    } else if (e.key === 'Enter') {
      // Only already-blocked matches showing: nothing to add, so Enter does nothing.
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  // mousedown so the pick lands before the input loses focus.
  box.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.i));
  });
}
