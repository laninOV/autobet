#!/usr/bin/env python3
"""
Opens the tennis live page and shows only selected tournaments in the
"Турнир" column. Runs in a real browser window and keeps the filter
active as the page updates.

Usage:
  python3 open_tennis_live.py
  # кастомные фильтры (через пробел):
  python3 open_tennis_live.py "Лига Про" "Кубок ТТ. Польша"
  # явная передача логина/пароля:
  python3 open_tennis_live.py --email you@example.com --password secret

Requirements:
  pip install playwright
  playwright install
"""

import json
import sys
import os
import argparse
import re
import csv
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs, urlunparse, parse_qsl, quote, unquote
from typing import List, Optional, Tuple, Set, Dict
from urllib import request as _urlrequest, parse as _urlparse
import threading
import time

URL = "https://tennis-score.pro/live_v2/"
URL_UPCOMING = "https://tennis-score.pro/up-games/"
AUTH_STATE_PATH = "tennis_auth_state.json"
# Prefer the extension bundled in this repo; allow override via env; fallback to user path
_HERE = os.path.dirname(__file__)
_REPO_EXT = os.path.join(_HERE, "tennis-score-extension")
DEFAULT_EXTENSION_PATH = os.environ.get(
    "AUTOBET_EXTENSION_PATH",
    _REPO_EXT if os.path.isdir(_REPO_EXT) else "/Users/lanin/Development/tennis-score-extension",
)
# Основной файл результатов: только подходящие матчи (GO/3/3/2/3)
# Начиная с последнего рефакторинга основной файл — `matches_3of3.csv`.
# Для обратной совместимости также дублируем в старое имя `live_3of3.csv`.
OUTPUT_LIVE_CSV = os.path.join(_HERE, "matches_3of3.csv")
OUTPUT_LIVE_CSV_COMPAT = os.path.join(_HERE, "live_3of3.csv")
OUTPUT_PREMA_CSV = os.path.join(_HERE, "prema_3of3.csv")
PROCESSED_LIVE_JSON = os.path.join(_HERE, "processed_live_urls.json")
PROCESSED_PREMA_JSON = os.path.join(_HERE, "processed_prema_urls.json")
KNOWN_LEAGUES_JSON = os.path.join(_HERE, "known_leagues.json")
FONBET_URL = "https://fon.bet/live/table-tennis"
FONBET_LOGIN_DEFAULT = "+7 916 261-82-40"
FONBET_PASSWORD_DEFAULT = "zxascvdf2Z!"

# Таймаут ожидания блока решения (может быть переопределён из аргументов)
DECISION_WAIT_MS = 2000

# Временно выключаем парсинг up-games (PREMATCH)
PARSE_UPCOMING = False

# Глобальный Telegram sender (устанавливается в run())
_TG_SENDER = None  # type: Optional[callable]

# Глобальный режим: сохранять/отправлять ВСЕ матчи (без требования GO/3/3/2/3)
ALLOW_ALL = False

# Telegram defaults (user-provided token) and chat id cache file
TG_DEFAULT_TOKEN = "8329315036:AAHEfnAf4ER7YE_dqFIsOMoO-s1b5G4kYTA"
TG_CHAT_ID_FILE = os.path.join(_HERE, ".telegram_chat_id")

DEFAULT_FILTERS = [
    # Общее правило: фильтруем по базовому названию лиги,
    # т.к. после него могут идти разные города/страны.
    "Лига Про",   # матчит любые варианты: "Лига Про. Минск", "Лига Про. Чехия" и т.п.
    "Кубок ТТ",   # матчит: "Кубок ТТ. Польша", "Кубок ТТ. Чехия" и др.
]

# Лиги, которые нужно исключать всегда (в UI и при сборе ссылок)
ALWAYS_EXCLUDED = ["Сетка Кап"]

# Глобальный флаг, чтобы не запускать параллельные пересканы
_SCAN_LOCK = threading.Lock()
# Global runtime switches
_IGNORE_PROCESSED = False
# Разрешить отправку всех матчей (игнорировать GO/3/3/2/3), но сохранять фильтр турниров
# По умолчанию шлём все подходящие матчи из разрешённых лиг,
# чтобы не требовать от пользователя каждый раз указывать --notify-all
ALLOW_NOTIFY_ALL = True

# Глобальный список известных лиг (собираем с live_v2 и переиспользуем на странице статистики)
_KNOWN_LEAGUES: List[str] = []
_LEAGUE_BY_URL: Dict[str, str] = {}
_ALLOWED_TOURNAMENTS: List[str] = []
_LIVE_SCORE_BY_URL: Dict[str, str] = {}
_LIVE_FINISHED_BY_URL: Dict[str, bool] = {}
_TG_MSG_BY_URL: Dict[str, int] = {}
_MATCH_DONE: Set[str] = set()
_LAST_TG_TEXT_BY_URL: Dict[str, str] = {}
_LIVE_SETS_BY_URL: Dict[str, List[str]] = {}
_LIVE_NAMES_BY_URL: Dict[str, List[str]] = {}
_LIVE_FAV_IS_LEFT_BY_URL: Dict[str, bool] = {}
_LIVE_LR_BY_URL: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
_STAKE_IS_FAV_BY_URL: Dict[str, Optional[bool]] = {}
_SHOW_DETAILS = False
_GLOBAL_EXT_PATH: Optional[str] = None
_CONTENT_JS_CACHE: Optional[str] = None
DRIVE_UI = False
SAFE_MODE = True  # по умолчанию бережный режим: без тяжёлых фильтров на странице
_PAUSED = False  # Пауза фонового сканирования/навигации
_LAST_LIVE_LINKS: List[str] = []  # последние собранные ссылки со страницы live
_LIVE_LAST_SEEN: Dict[str, float] = {}  # mono time when link last seen on live

# Debug helper
def _is_debug() -> bool:
    try:
        v = os.getenv('AUTOBET_DEBUG')
        return not (v in (None, '', '0', 'false', 'False'))
    except Exception:
        return False

def _dbg(tag: str, msg: str) -> None:
    if _is_debug():
        try:
            print(f"[debug:{tag}] {msg}")
        except Exception:
            pass

# Telegram API helpers (send/edit)
_TG_TOKEN: Optional[str] = None
_TG_CHAT_ID: Optional[str] = None
_TG_MSG_MAP_FILE = os.path.join(os.path.dirname(__file__), ".tg_msg_map.json")

def _load_tg_map():
    try:
        if os.path.exists(_TG_MSG_MAP_FILE):
            with open(_TG_MSG_MAP_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                for k, v in data.items():
                    try:
                        if isinstance(v, dict):
                            mid = v.get('id'); txt = v.get('text')
                            if isinstance(mid, int):
                                _TG_MSG_BY_URL[k] = mid
                            if isinstance(txt, str):
                                _LAST_TG_TEXT_BY_URL[k] = txt
                    except Exception:
                        continue
    except Exception:
        pass

def _save_tg_map():
    try:
        out = {}
        for k, mid in _TG_MSG_BY_URL.items():
            try:
                out[k] = { 'id': mid, 'text': _LAST_TG_TEXT_BY_URL.get(k) }
            except Exception:
                out[k] = { 'id': mid, 'text': None }
        with open(_TG_MSG_MAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def _load_content_js_from_ext(ext_path: Optional[str]) -> Optional[str]:
    """Load content script JS from the extension folder.
    Returns JS string or None if not available."""
    try:
        base = ext_path or DEFAULT_EXTENSION_PATH or _REPO_EXT
        if not base:
            return None
        path = os.path.join(os.path.expanduser(base), "content", "index.js")
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None

def _ensure_content_script(context, page, ext_path: Optional[str]) -> bool:
    """Best‑effort injection of the content script when Chromium didn't attach it.
    Adds init_script on context and injects into the current page. Returns True if injected."""
    try:
        global _CONTENT_JS_CACHE
        if not _CONTENT_JS_CACHE:
            _CONTENT_JS_CACHE = _load_content_js_from_ext(ext_path)
        js = _CONTENT_JS_CACHE
        if not js:
            return False
        # добавляем init_script только один раз на контекст
        try:
            if not getattr(context, "__autobet_init_injected__", False):
                context.add_init_script(js)
                setattr(context, "__autobet_init_injected__", True)
        except Exception:
            pass
        try:
            page.add_script_tag(content=js)
        except Exception:
            pass
        try:
            print("[ext] принудительная инъекция content/index.js выполнена")
        except Exception:
            pass
        return True
    except Exception:
        return False

def _upsert_tg_message(url: str, text: str, finished: bool = False) -> None:
    """Send or edit a Telegram message per match URL.
    - Sends a new message on first encounter, stores message_id
    - Edits the message on subsequent updates
    - On finish flag, appends final marker and stops further edits
    """
    try:
        if not (_TG_TOKEN and _TG_CHAT_ID):
            return
        if url in _MATCH_DONE:
            return
        canon = _canonical_stats_url(url)
        mid = _TG_MSG_BY_URL.get(url) or _TG_MSG_BY_URL.get(canon)
        _send = globals().get('_tg_send')
        _edit = globals().get('_tg_edit')
        if mid:
            ok = False
            if callable(_edit):
                ok = bool(_edit(mid, text))
            if not ok and callable(_send):
                new_id = _send(text)
                if isinstance(new_id, int):
                    _TG_MSG_BY_URL[url] = new_id
                    _TG_MSG_BY_URL[canon] = new_id
                    mid = new_id
                    _save_tg_map()
        else:
            if callable(_send):
                new_id = _send(text)
                if isinstance(new_id, int):
                    _TG_MSG_BY_URL[url] = new_id
                    _TG_MSG_BY_URL[canon] = new_id
                    mid = new_id
                    _save_tg_map()
        # persist last text
        if mid and isinstance(text, str):
            _LAST_TG_TEXT_BY_URL[url] = text
            _LAST_TG_TEXT_BY_URL[canon] = text
            _save_tg_map()
        if finished and mid:
            # Add final marker once
            final_text = text
            if '🏁' not in text:
                final_text = text + "\n🏁 Игра завершена"
            if callable(_edit):
                _edit(mid, final_text)
                _LAST_TG_TEXT_BY_URL[url] = final_text
                _LAST_TG_TEXT_BY_URL[canon] = final_text
                _save_tg_map()
            _MATCH_DONE.add(url)
    except Exception:
        pass

def _inject_or_replace_score(text: str, score: str) -> str:
    try:
        lines = (text or '').splitlines()
        replaced = False
        for i, line in enumerate(lines):
            if line.strip().startswith('📟'):
                lines[i] = f"📟 Счёт: {score}"
                replaced = True
                # ensure a blank line before the score line for readability
                try:
                    if i > 0 and lines[i-1].strip() != '':
                        lines.insert(i, '')
                except Exception:
                    pass
                break
        if not replaced:
            # insert strictly after the last verdict line starting with '🎯'
            insert_at = None
            for i in range(len(lines)-1, -1, -1):
                if lines[i].lstrip().startswith('🎯'):
                    insert_at = i + 1
                    break
            if insert_at is None:
                # fallback: append at end
                insert_at = len(lines)
            # add a blank line before the score for readability
            try:
                if insert_at <= len(lines) and (insert_at == len(lines) or lines[insert_at].strip() != ''):
                    lines.insert(insert_at, '')
                    insert_at += 1
            except Exception:
                pass
            lines.insert(insert_at, f"📟 Счёт: {score}")
        return "\n".join(lines)
    except Exception:
        return text

def _compose_score_with_sets(url: str, base_score: Optional[str]) -> Optional[str]:
    try:
        s = base_score or _LIVE_SCORE_BY_URL.get(url)
        if not s:
            return None
        # Clean and trim pairs (remove trailing 0:0)
        def clean(ps):
            if not isinstance(ps, list):
                return []
            out = []
            for it in ps:
                try:
                    a,b = str(it).split(':',1)
                    out.append(f"{a.strip()}:{b.strip()}")
                except Exception:
                    continue
            while out and re.match(r"^0\s*:\s*0$", out[-1]):
                out.pop()
            return out
        sets = clean(_LIVE_SETS_BY_URL.get(url))
        # Optional status marker for the STAKE side (not necessarily favorite)
        marker = None
        try:
            # decide favorite set count orientation if known (for Fav:Opp orientation only)
            fav_left = _LIVE_FAV_IS_LEFT_BY_URL.get(url)
            if fav_left is not None:
                try:
                    a, b = s.split(':', 1)
                    sa = int(str(a).strip()); sb = int(str(b).strip())
                    fav_sets = sa if fav_left else sb
                    opp_sets = sb if fav_left else sa
                    finished = bool(_LIVE_FINISHED_BY_URL.get(url))
                    # Determine stake side (default = favorite)
                    stake_is_fav = _STAKE_IS_FAV_BY_URL.get(url)
                    if stake_is_fav is None:
                        stake_is_fav = True
                    stake_sets = fav_sets if stake_is_fav else opp_sets
                    if stake_sets >= 3:
                        marker = '✅'
                    elif stake_sets >= 2:
                        marker = '🟡'
                    else:
                        marker = '❌'
                    # Re-orient entire score and sets to Fav:Opp if fav is on the right
                    if fav_left is False:
                        # swap score
                        s = f"{sb}:{sa}"
                        # swap every pair in sets
                        new_sets = []
                        for p in sets:
                            try:
                                x,y = p.split(':',1)
                                new_sets.append(f"{y}:{x}")
                            except Exception:
                                new_sets.append(p)
                        sets = new_sets
                except Exception:
                    pass
        except Exception:
            pass
        core = s
        if sets:
            core = f"{s} (" + ", ".join(sets) + ")"
        if marker:
            core = f"{core} {marker}"
        return core
    except Exception:
        return base_score

def _refresh_live_scores(urls: List[str]) -> None:
    if not (_TG_TOKEN and _TG_CHAT_ID):
        return
    _edit = globals().get('_tg_edit')
    if not callable(_edit):
        return
    for url in urls:
        try:
            if url in _MATCH_DONE:
                continue
            mid = _TG_MSG_BY_URL.get(url)
            canon = _canonical_stats_url(url)
            if not mid:
                mid = _TG_MSG_BY_URL.get(canon)
            composed = _compose_score_with_sets(canon, _LIVE_SCORE_BY_URL.get(canon) or _LIVE_SCORE_BY_URL.get(url))
            if not composed:
                continue
            old = _LAST_TG_TEXT_BY_URL.get(url) or _LAST_TG_TEXT_BY_URL.get(canon)
            if not old or not mid:
                # нет базового сообщения — пропускаем
                if os.getenv('AUTOBET_DEBUG'):
                    try:
                        print(f"[edit-skip] no base msg for {canon}")
                    except Exception:
                        pass
                continue
            new_text = _inject_or_replace_score(old, composed)
            finished = bool(_LIVE_FINISHED_BY_URL.get(canon) or _LIVE_FINISHED_BY_URL.get(url))
            if finished and '🏁' not in new_text:
                new_text = new_text + "\n🏁 Игра завершена"
            if new_text != old:
                ok = _edit(mid, new_text)
                if os.getenv('AUTOBET_DEBUG'):
                    try:
                        print(f"[edit] {canon} score='{composed}' ok={ok}")
                    except Exception:
                        pass
                if ok:
                    _LAST_TG_TEXT_BY_URL[url] = new_text
                    _LAST_TG_TEXT_BY_URL[canon] = new_text
                    _TG_MSG_BY_URL[canon] = mid
                    _save_tg_map()
                    if finished:
                        _MATCH_DONE.add(url)
        except Exception:
            continue


CONTROL_JS = r"""
(() => {
  const styleId = '__auto_controls_style__';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .__auto-controls__ {
        position: fixed; left: 12px; bottom: 12px; z-index: 99999;
        display: flex; gap: 8px; align-items: center;
        background: rgba(20,20,20,.85); color: #fff;
        font: 12px/1.4 system-ui, sans-serif; padding: 8px 10px;
        border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.25);
      }
      .__auto-controls__ button {
        background: #2b8a3e; color: #fff; border: 0; border-radius: 6px;
        padding: 6px 10px; cursor: pointer; font-weight: 600;
      }
      .__auto-controls__ button[disabled] { opacity: .6; cursor: default; }
      .__auto-controls__ .pause { background:#a87900; }
    `;
    document.documentElement.appendChild(s);
  }

  let box = document.querySelector('.__auto-controls__');
  if (!box) {
    box = document.createElement('div');
    box.className = '__auto-controls__';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⟲ Перезапустить автоскан';
    btn.title = 'Очистить файлы и заново собрать матчи';
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = '⟲ Перезапуск...';
        if (typeof window.autobetRestart === 'function') {
          await window.autobetRestart();
          btn.textContent = 'Готово';
          setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1200);
        } else {
          btn.textContent = 'Нет моста';
          setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1200);
        }
      } catch (e) {
        btn.textContent = 'Ошибка';
        setTimeout(() => { btn.textContent = '⟲ Перезапустить автоскан'; btn.disabled = false; }, 1500);
      }
    });
    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'pause';
    let paused = false;
    const sync = () => { pause.textContent = paused? '▶ Продолжить' : '⏸ Пауза'; };
    sync();
    pause.addEventListener('click', async () => {
      try {
        pause.disabled = true;
        if (typeof window.autobetTogglePause === 'function') {
          paused = await window.autobetTogglePause();
          sync();
        }
      } finally { pause.disabled = false; }
    });
    box.appendChild(btn);
    box.appendChild(pause);
    document.body.appendChild(box);
  }
  return true;
})()
"""


FILTER_JS = r"""
(() => {
  if (window.__AUTO_FILTER_ACTIVE__) return true; // idempotent guard
  window.__AUTO_FILTER_ACTIVE__ = true;
  const ALLOWED = new Set(%(allowed)s);
  const EXCLUDED = new Set(%(excluded)s);

  const styleId = '__auto_filter_style__';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .__auto-filter-badge__ {
        position: fixed; right: 12px; bottom: 12px; z-index: 99999;
        background: rgba(20,20,20,.8); color: #fff; font: 12px/1.4 sans-serif;
        padding: 8px 10px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.3);
      }
      .__auto-filter-badge__ code { color: #9be; }
      .__auto-filter-hidden__ { display: none !important; }
    `;
    document.documentElement.appendChild(s);
  }

  function ensureBadge() {
    let badge = document.querySelector('.__auto-filter-badge__');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = '__auto-filter-badge__';
      badge.title = 'Автофильтр применён к списку матчей';
      const listA = Array.from(ALLOWED).map(s => `<code>${s}</code>`).join(', ') || 'все';
      const listE = Array.from(EXCLUDED).map(s => `<code>${s}</code>`).join(', ');
      badge.innerHTML = `Фильтр: ${listA}` + (listE ? `<br>Исключено: ${listE}` : '');
      document.body.appendChild(badge);
    }
    return badge;
  }

  function filterByTableHeaders(root) {
    // Find tables which contain a header cell with text 'Турнир'
    const tables = root.querySelectorAll('table');
    tables.forEach(table => {
      const thead = table.tHead || table.querySelector('thead');
      if (!thead) return;
      const headerCells = Array.from(thead.querySelectorAll('th, td'));
      const idx = headerCells.findIndex(th => /\bТурнир\b/i.test(th.textContent || ''));
      if (idx === -1) return;

      // Filter rows according to that column
      const rows = table.tBodies.length ? table.tBodies[0].rows : table.querySelectorAll('tbody tr, tr');
      Array.from(rows).forEach(tr => {
        const cells = tr.cells ? Array.from(tr.cells) : Array.from(tr.querySelectorAll('td'));
        if (!cells.length) return;
        const cell = cells[idx] || cells[cells.length - 1];
        const txt = (cell && cell.textContent) ? cell.textContent.trim() : tr.textContent.trim();
        const blocked = Array.from(EXCLUDED).some(s => txt.includes(s));
        const allowed = (ALLOWED.size ? Array.from(ALLOWED).some(s => txt.includes(s)) : true);
        const show = allowed && !blocked;
        tr.classList.toggle('__auto-filter-hidden__', !show);
      });
    });
  }

  function genericRowFilter(root) {
    // As a fallback for non-table UIs, hide items that don't include allowed tokens
    const candidates = new Set();
    // common row-like containers in live lists
    root.querySelectorAll('[role="row"], .row, .list-item, .match, .event, li, tr').forEach(el => candidates.add(el));
    candidates.forEach(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const blocked = Array.from(EXCLUDED).some(s => text.includes(s));
      const allowed = (ALLOWED.size ? Array.from(ALLOWED).some(s => text.includes(s)) : true);
      const show = allowed && !blocked;
      el.classList.toggle('__auto-filter-hidden__', !show);
    });
  }

  function applyFilter(root = document) {
    try { filterByTableHeaders(root); } catch (e) { /* ignore */ }
    try { genericRowFilter(root); } catch (e) { /* ignore */ }
    ensureBadge();
  }

  // Initial apply and observe future changes
  const debounced = (() => {
    let t = null;
    return () => {
      if (t) cancelAnimationFrame(t);
      t = requestAnimationFrame(() => applyFilter());
    };
  })();

  applyFilter();

  const observer = new MutationObserver(debounced);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  // Re-apply periodically to combat virtualized/React rerenders
  if (!window.__AUTO_FILTER_INTERVAL__) {
    window.__AUTO_FILTER_INTERVAL__ = setInterval(debounced, 2000);
  }

  return true;
})()
"""

# Лёгкий фильтр: без MutationObserver, только периодический проход (меньше нагрузка на Chromium)
FILTER_JS_LIGHT = r"""
(() => {
  if (window.__AUTO_FILTER_ACTIVE_LIGHT__) return true;
  window.__AUTO_FILTER_ACTIVE_LIGHT__ = true;
  const ALLOWED = new Set(%(allowed)s);
  const EXCLUDED = new Set(%(excluded)s);
  const styleId = '__auto_filter_style__';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .__auto-filter-badge__ { position: fixed; right: 12px; bottom: 12px; z-index: 99999; background: rgba(20,20,20,.8); color:#fff; font:12px/1.4 sans-serif; padding:8px 10px; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,.3); }
      .__auto-filter-badge__ code { color:#9be; }
      .__auto-filter-hidden__ { display:none !important; }
    `;
    document.documentElement.appendChild(s);
  }
  function ensureBadge(){ let b=document.querySelector('.__auto-filter-badge__'); if(!b){ b=document.createElement('div'); b.className='__auto-filter-badge__'; const a=Array.from(ALLOWED).map(s=>`<code>${s}</code>`).join(', ')||'все'; const e=Array.from(EXCLUDED).map(s=>`<code>${s}</code>`).join(', '); b.innerHTML=`Фильтр: ${a}`+(e?`<br>Исключено: ${e}`:''); document.body.appendChild(b);} return b; }
  function apply(){
    const tables = Array.from(document.querySelectorAll('table'));
    for(const table of tables){
      const thead = table.tHead || table.querySelector('thead'); if(!thead) continue;
      const headerCells = Array.from(thead.querySelectorAll('th, td'));
      const idx = headerCells.findIndex(th => /\bТурнир\b/i.test(th.textContent||'')); if(idx===-1) continue;
      const rows = table.tBodies.length? Array.from(table.tBodies[0].rows): Array.from(table.querySelectorAll('tbody tr, tr'));
      for(const tr of rows){
        const cells = tr.cells ? Array.from(tr.cells): Array.from(tr.querySelectorAll('td'));
        if(!cells.length) continue; const cell = cells[idx] || cells[cells.length-1];
        const txt = (cell && cell.textContent)? (cell.textContent).trim(): (tr.textContent||'').trim();
        const blocked = Array.from(EXCLUDED).some(s => txt.includes(s));
        const allowed = (ALLOWED.size? Array.from(ALLOWED).some(s => txt.includes(s)) : true);
        tr.classList.toggle('__auto-filter-hidden__', !(allowed && !blocked));
      }
    }
    ensureBadge();
  }
  apply(); if (!window.__AUTO_FILTER_INTERVAL_LIGHT__) { window.__AUTO_FILTER_INTERVAL_LIGHT__ = setInterval(apply, 3000); } return true;
})()
"""

def _apply_filter_to_all_frames(page, filters: List[str], excluded: Optional[List[str]] = None) -> None:
    try:
        allowed_js = json.dumps(filters or DEFAULT_FILTERS, ensure_ascii=False)
    except Exception:
        allowed_js = json.dumps(DEFAULT_FILTERS, ensure_ascii=False)
    try:
        excluded_js = json.dumps(excluded or [], ensure_ascii=False)
    except Exception:
        excluded_js = '[]'
    # Apply in main frame
    try:
        page.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
    except Exception:
        pass
    # Apply in same-origin iframes
    try:
        for fr in page.frames:
            try:
                if fr == page.main_frame:
                    continue
                fr.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
            except Exception:
                continue
    except Exception:
        pass

def _count_visible_stats_links_all_frames(page) -> int:
    total = 0
    script = '() => Array.from(document.querySelectorAll("a[href*=\\"/stats/?\\\"]")).filter(a => !a.closest(".__auto-filter-hidden__")).length'
    try:
        v = page.evaluate(script)
        if isinstance(v, (int, float)):
            total += int(v)
    except Exception:
        pass
    try:
        for fr in page.frames:
            try:
                if fr == page.main_frame:
                    continue
                v = fr.evaluate(script)
                if isinstance(v, (int, float)):
                    total += int(v)
            except Exception:
                continue
    except Exception:
        pass
    return total


def _init_output_files():
    """Hard-reset output files and create fresh CSV with header.
    New format: time_hms,favorite,opponent,nb3_noh2h_3,nb3_h2h_3,logistic3_fav,indexP3_fav,url
    """
    paths = [
        (OUTPUT_LIVE_CSV, "matches_3of3.csv"),
        (OUTPUT_LIVE_CSV_COMPAT, "live_3of3.csv"),
        (PROCESSED_LIVE_JSON, "processed_live_urls.json"),
    ]
    for path, label in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
                print(f"[init] removed {label}: {path}")
        except Exception as e:
            print(f"[init] warn: cannot remove {label} at {path}: {e}")
    # create empty CSV with header
    try:
        with open(OUTPUT_LIVE_CSV, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav", "url"])
        print(f"[init] created header at {OUTPUT_LIVE_CSV}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV}: {e}")
    # инициализируем файл совместимости тем же заголовком
    try:
        with open(OUTPUT_LIVE_CSV_COMPAT, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav", "url"])
        print(f"[init] created header at {OUTPUT_LIVE_CSV_COMPAT}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV_COMPAT}: {e}")

    # Не очищаем KNOWN_LEAGUES_JSON: он накапливается между запусками.


def _update_known_leagues_from_page(page) -> None:
    """Читает список лиг с live_v2 из выпадающего списка и сохраняет локально.
    Данные сохраняются в глобальную переменную и в файл known_leagues.json.
    """
    global _KNOWN_LEAGUES
    try:
        leagues = page.evaluate(
            """
            () => {
              const sel = document.querySelector('#tourney-select');
              if (!sel) return [];
              const opts = Array.from(sel.querySelectorAll('option'))
                .map(o => (o.textContent||'').trim())
                .filter(Boolean);
              // Удалим служебный пункт "Все турниры"
              return opts.filter(t => !/^все\s+турниры$/i.test(t));
            }
            """,
        ) or []
        if isinstance(leagues, list):
            # Нормализуем и обновим глобальный список без дублей, сохраним порядок
            seen = set()
            merged: List[str] = []
            for s in (leagues + _KNOWN_LEAGUES):
                if not isinstance(s, str):
                    continue
                t = s.strip()
                if not t or t in seen:
                    continue
                seen.add(t)
                merged.append(t)
            _KNOWN_LEAGUES = merged
            # Сохраним на диск для последующих запусков
            try:
                with open(KNOWN_LEAGUES_JSON, 'w', encoding='utf-8') as fh:
                    json.dump(_KNOWN_LEAGUES, fh, ensure_ascii=False, indent=2)
            except Exception:
                pass
            print(f"[leagues] обновлено: {len(_KNOWN_LEAGUES)} шт.")
    except Exception as e:
        print(f"[leagues] warn: не удалось прочитать список лиг: {e}")


def _load_known_leagues_from_disk() -> None:
    global _KNOWN_LEAGUES
    try:
        if os.path.exists(KNOWN_LEAGUES_JSON):
            with open(KNOWN_LEAGUES_JSON, 'r', encoding='utf-8') as fh:
                lst = json.load(fh)
            if isinstance(lst, list):
                _KNOWN_LEAGUES = [str(s).strip() for s in lst if isinstance(s, str) and str(s).strip()]
    except Exception:
        pass


HIDE_PASS = False

def run(filters: List[str]) -> None:
    from playwright.sync_api import sync_playwright

    args = parse_args_for_runtime()

    # Гарантированно очищаем файлы результатов перед запуском браузера
    _init_output_files()

    with sync_playwright() as p:
        # Load persisted Telegram message ids/texts to allow edits across restarts
        try:
            _load_tg_map()
        except Exception:
            pass
        ext_path = os.path.expanduser(args.extension_path) if hasattr(args, "extension_path") and args.extension_path else None

        context = None
        page = None

        # Enable PREMATCH if requested
        try:
            if getattr(args, 'prematch', False):
                global PARSE_UPCOMING
                PARSE_UPCOMING = True
        except Exception:
            pass

        # Allowed leagues policy:
        # If user provided positional filters, use them; otherwise use defaults and optional --setka
        # "Сетка Кап" исключаем навсегда — опции setka/AUTOBET_SETKA игнорируем
        want_setka = False
        try:
            user_filters = getattr(args, 'filters', None)
        except Exception:
            user_filters = None
        if user_filters:
            filters = list(user_filters)
        else:
            # По умолчанию берём «Лига Про» и «Кубок ТТ». «Сетка Кап» исключаем всегда.
            filters = ["Лига Про", "Кубок ТТ"]
        try:
            # Обновим глобальный список допускаемых турниров (для доп. фильтра при сборе ссылок)
            global _ALLOWED_TOURNAMENTS
            _ALLOWED_TOURNAMENTS = [s for s in (filters or []) if isinstance(s, str) and s.strip()]
        except Exception:
            pass

        # Учитываем флаг all: отключаем фильтрацию турниров и сохраняем все матчи
        try:
            if getattr(args, 'all', False):
                # Пустая строка в ALLOWED заставляет фильтр пропускать все строки
                filters[:] = [""]
                global ALLOW_ALL
                ALLOW_ALL = True
        except Exception:
            pass

        # Отправлять все матчи, но оставляя турнирный фильтр
        try:
            if getattr(args, 'notify_all', False) or (os.getenv('AUTOBET_NOTIFY_ALL') not in (None, '', '0', 'false', 'False')):
                global ALLOW_NOTIFY_ALL
                ALLOW_NOTIFY_ALL = True
        except Exception:
            pass

        # Подгружаем известные лиги с диска (если есть сохранённый список)
        _load_known_leagues_from_disk()

        # Hide PASS option
        try:
            global HIDE_PASS
            HIDE_PASS = bool(getattr(args, 'hide_pass', False) or (os.getenv('AUTOBET_HIDE_PASS') not in (None, '', '0', 'false', 'False')))
        except Exception:
            pass

        # Setup Telegram sender if requested
        try:
            if getattr(args, 'tg', False):
                token = getattr(args, 'tg_token', None) or TG_DEFAULT_TOKEN
                chat_id = getattr(args, 'tg_chat', None)
                # Try load cached chat id from file if not provided
                if not chat_id:
                    try:
                        if os.path.exists(TG_CHAT_ID_FILE):
                            with open(TG_CHAT_ID_FILE, 'r', encoding='utf-8') as fh:
                                chat_id = fh.read().strip()
                    except Exception:
                        pass
                # If still missing, try getUpdates (user must send any message to the bot first)
                if not chat_id and token:
                    try:
                        url = f"https://api.telegram.org/bot{token}/getUpdates"
                        with _urlrequest.urlopen(url, timeout=8) as resp:
                            data = json.loads(resp.read().decode('utf-8'))
                        if data.get('ok') and isinstance(data.get('result'), list) and data['result']:
                            last = data['result'][-1]
                            chat = (last.get('message') or last.get('channel_post') or {}).get('chat') or {}
                            cid = chat.get('id')
                            if cid is not None:
                                chat_id = str(cid)
                                try:
                                    with open(TG_CHAT_ID_FILE, 'w', encoding='utf-8') as fh:
                                        fh.write(chat_id)
                                except Exception:
                                    pass
                    except Exception:
                        pass
                # If chat id provided explicitly, cache it
                if chat_id and not os.path.exists(TG_CHAT_ID_FILE):
                    try:
                        with open(TG_CHAT_ID_FILE, 'w', encoding='utf-8') as fh:
                            fh.write(str(chat_id))
                    except Exception:
                        pass
                if token and chat_id:
                    # Initialize Telegram API helpers
                    global _TG_TOKEN, _TG_CHAT_ID
                    _TG_TOKEN, _TG_CHAT_ID = token, str(chat_id)

                    def _tg_send(text: str) -> Optional[int]:
                        try:
                            api_base = f"https://api.telegram.org/bot{_TG_TOKEN}/sendMessage"
                            data = _urlparse.urlencode({
                                'chat_id': _TG_CHAT_ID,
                                'text': text,
                                'parse_mode': 'HTML',
                                'disable_web_page_preview': 'true'
                            }).encode('utf-8')
                            req = _urlrequest.Request(api_base, data=data)
                            with _urlrequest.urlopen(req, timeout=10) as resp:
                                r = json.loads(resp.read().decode('utf-8'))
                            if r.get('ok') and isinstance(r.get('result'), dict):
                                return r['result'].get('message_id')
                        except Exception:
                            pass
                        return None

                    def _tg_edit(message_id: int, text: str) -> bool:
                        try:
                            api_base = f"https://api.telegram.org/bot{_TG_TOKEN}/editMessageText"
                            data = _urlparse.urlencode({
                                'chat_id': _TG_CHAT_ID,
                                'message_id': str(message_id),
                                'text': text,
                                'parse_mode': 'HTML',
                                'disable_web_page_preview': 'true'
                            }).encode('utf-8')
                            req = _urlrequest.Request(api_base, data=data)
                            with _urlrequest.urlopen(req, timeout=10) as resp:
                                r = json.loads(resp.read().decode('utf-8'))
                            return bool(r.get('ok'))
                        except Exception:
                            return False

                    # expose for later
                    globals()['_tg_send'] = _tg_send
                    globals()['_tg_edit'] = _tg_edit

                    # Also keep simple sender for rare one-off uses
                    def _send(text: str):
                        _tg_send(text)
                    global _TG_SENDER
                    _TG_SENDER = _send
                    # Startup ping so user sees bot is alive
                    try:
                        ts = datetime.now().isoformat(timespec="seconds")
                        _tg_send(f"✅ Autobet started {ts}. Chat: {chat_id}")
                    except Exception as e:
                        try:
                            print(f"[tg] warn: cannot send startup ping: {e}")
                        except Exception:
                            pass
                else:
                    print("[tg] Включено -tg, но не удалось определить chat_id. Напишите любое сообщение боту и перезапустите.")
        except Exception:
            pass

        # Всегда пытаемся загрузить расширение, если оно доступно и среда позволяет
        no_ext_flag = False
        try:
            # CLI flag or env to disable extension explicitly
            no_ext_flag = bool(os.getenv('AUTOBET_NO_EXTENSION'))
        except Exception:
            no_ext_flag = False
        try:
            if getattr(args, 'no_extension', False):
                no_ext_flag = True
        except Exception:
            pass
        # Не блокируем расширение по DISPLAY: на macOS DISPLAY обычно пустой, но headful работает
        try:
            headless_cli = bool(getattr(args, 'headless', False))
        except Exception:
            headless_cli = False
        want_extension = bool(ext_path and os.path.isdir(ext_path) and not no_ext_flag and not headless_cli)
        try:
            print(f"[ext] режим: {'с расширением' if want_extension else 'без расширения'}")
        except Exception:
            pass

        # Decide whether to enable server perf throttling for content script
        perf_server = False
        try:
            perf_server = bool(os.getenv('AUTOBET_PERF','').lower() == 'server' or getattr(args, 'server_perf', False) or os.getenv('AUTOBET_SERVER'))
        except Exception:
            perf_server = False

        if want_extension:
            # Use persistent context to load extension
            user_data_dir = os.path.join(os.path.dirname(__file__), ".chromium-profile")
            os.makedirs(user_data_dir, exist_ok=True)
            # Clean stale Chromium profile locks to avoid startup hang
            try:
                for fname in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
                    pth = os.path.join(user_data_dir, fname)
                    if os.path.exists(pth):
                        os.remove(pth)
            except Exception:
                pass
            # Extensions не поддерживаются в headless-режиме — принудительно выключим headless,
            # чтобы расширение гарантированно подхватилось (особенно при запуске от root)
            try:
                if getattr(args, 'headless', False):
                    print("[ext] headless отключён, чтобы загрузить расширение")
            except Exception:
                pass
            headless_for_ext = False
            # Дополнительные флаги для Chromium под root/на серверах
            extra_args = []
            try:
                if hasattr(os, 'geteuid') and os.geteuid() == 0:
                    extra_args += ["--no-sandbox", "--disable-setuid-sandbox"]
            except Exception:
                pass
            # Уменьшаем вероятность падений из‑за /dev/shm
            extra_args += ["--disable-dev-shm-usage"]
            args_list = [
                f"--disable-extensions-except={ext_path}",
                f"--load-extension={ext_path}",
            ] + extra_args
            try:
                context = p.chromium.launch_persistent_context(
                    user_data_dir,
                    headless=headless_for_ext,
                    args=args_list,
                )
            except Exception as e:
                print(f"[ext] не удалось запустить Chromium с расширением: {e}")
                print("[ext] продолжаю без расширения (headless)")
                want_extension = False
                context = None
            try:
                globals()['_GLOBAL_CONTEXT'] = context
                globals()['_GLOBAL_EXT_PATH'] = ext_path
                # Optional: set server perf flag for content script across all pages
                if perf_server:
                    try:
                        context.add_init_script("try{ localStorage.setItem('__TSX_PERF','server'); window.__TSX_SERVER_MODE__=true; }catch(_){ }")
                    except Exception:
                        pass
                # Block heavy resource types to reduce RAM/CPU
                try:
                    def _route_handler(route, request):
                        try:
                            rt = request.resource_type
                            if rt in ("image", "media", "font"):
                                return route.abort()
                        except Exception:
                            pass
                        return route.continue_()
                    context.route("**/*", _route_handler)
                except Exception:
                    pass
            except Exception:
                pass
            if context is not None:
                page = context.new_page() if len(context.pages) == 0 else context.pages[0]
                try:
                    print(f"[ext] загружено из: {ext_path}")
                except Exception:
                    pass

        if not want_extension:
            # Regular non-persistent context (no extension)
            headless_flag = True
            try:
                headless_flag = bool(getattr(args, 'headless', False) or os.getenv('AUTOBET_HEADLESS'))
            except Exception:
                headless_flag = True
            browser = p.chromium.launch(headless=headless_flag, args=["--disable-dev-shm-usage"]) 
            storage = AUTH_STATE_PATH if os.path.exists(AUTH_STATE_PATH) else None
            context = browser.new_context(storage_state=storage)
            page = context.new_page()
            try:
                globals()['_GLOBAL_CONTEXT'] = context
                globals()['_GLOBAL_BROWSER'] = browser
                if perf_server:
                    try:
                        context.add_init_script("try{ localStorage.setItem('__TSX_PERF','server'); window.__TSX_SERVER_MODE__=true; }catch(_){ }")
                    except Exception:
                        pass
                # Block heavy resource types to reduce RAM/CPU
                try:
                    def _route_handler(route, request):
                        try:
                            rt = request.resource_type
                            if rt in ("image", "media", "font"):
                                return route.abort()
                        except Exception:
                            pass
                        return route.continue_()
                    context.route("**/*", _route_handler)
                except Exception:
                    pass
            except Exception:
                pass

        # Применим таймаут ожидания решения из аргументов
        try:
            global DECISION_WAIT_MS
            DECISION_WAIT_MS = max(500, int(getattr(args, 'decision_wait_ms', DECISION_WAIT_MS)))
        except Exception:
            pass

        page.goto(URL, wait_until="domcontentloaded")
        _dbg('nav', f"opened {URL}")
        # Небольшая задержка для стабилизации отрисовки списка
        try:
            pre_collect_ms = int(getattr(args, 'pre_collect_ms', 400))
            if pre_collect_ms > 0:
                page.wait_for_timeout(pre_collect_ms)
        except Exception:
            pass
        # Сразу применим визуальную фильтрацию по лигам на live-странице (только основной документ)
        try:
            # Передаём списки в localStorage — их подхватит content script расширения
            try:
                excl_loc = (getattr(args,'exclude',None) or []) + ALWAYS_EXCLUDED
                page.evaluate("(a,b)=>{ try{ localStorage.setItem('__AUTO_ALLOW', JSON.stringify(a||[])); localStorage.setItem('__AUTO_EXCLUDE', JSON.stringify(b||[])); }catch(_){ } }", filters or DEFAULT_FILTERS, excl_loc)
            except Exception:
                pass
            try:
                excl = getattr(args, 'exclude', None)
            except Exception:
                excl = None
            if not excl:
                ex_env = os.getenv('AUTOBET_EXCLUDE', '')
                if ex_env:
                    excl = [s.strip() for s in ex_env.split(',') if s.strip()]
            excl = (excl or []) + ALWAYS_EXCLUDED
            allowed_js = json.dumps(filters or DEFAULT_FILTERS, ensure_ascii=False)
            excluded_js = json.dumps(excl or [], ensure_ascii=False)
            page.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
            _dbg('filter', f"applied with allowed={len(filters or [])} excluded={(len(excl or []))}")
            try:
                page.evaluate("console.info('AUTO:filter applied')")
            except Exception:
                pass
            # Лёгкая диагностика: сколько видимых ссылок на /stats сейчас на экране (только основной документ)
            try:
                cnt = page.evaluate('() => Array.from(document.querySelectorAll("a[href*=\\"/stats/?\\\"]")).filter(a => !a.closest(".__auto-filter-hidden__")).length')
                print(f"[live] visible stats links after filter: {int(cnt) if isinstance(cnt,(int,float)) else cnt}")
                _dbg('filter', f"visible links after filter: {cnt}")
            except Exception:
                pass
        except Exception:
            pass
        # Диагностика CS: проверяем маркер загрузки контент‑скрипта
        try:
            loaded = page.evaluate(
                "() => (document.documentElement && document.documentElement.getAttribute('data-tsx-content-loaded')==='1')"
            )
            if not loaded:
                try:
                    print("[ext] маркер контент‑скрипта не найден (OK на первом рендере); продолжаю")
                except Exception:
                    pass
        except Exception:
            pass

        # Try to dismiss common cookie popups quickly (best-effort, ignore failures)
        for text in ("Принять", "Согласен", "Accept", "I Agree"):
            try:
                page.locator(f"button:has-text(\"{text}\")").first.click(timeout=1000)
            except Exception:
                pass

        # Ensure logged in (if credentials provided or known)
        email = args.email or os.getenv("TENNIS_EMAIL") or "barbosa197223@gmail.com"
        password = args.password or os.getenv("TENNIS_PASSWORD") or "FiksA732528"

        print("Проверяю авторизацию...")
        try:
            if is_logged_in(page):
                print("[login] уже авторизован")
            else:
                if not ensure_login(context, page, email, password):
                    print("[login] Предупреждение: не удалось войти. Продолжаю без авторизации.")
        except Exception:
            # На всякий случай не блокируем поток
            print("[login] не удалось проверить статус, продолжаю…")

        allowed_js = json.dumps(filters, ensure_ascii=False)
        # Prepare excluded leagues list from args/env + ALWAYS_EXCLUDED
        try:
            excluded = getattr(args, 'exclude', None)
        except Exception:
            excluded = None
        if not excluded:
            ex_env = os.getenv('AUTOBET_EXCLUDE', '')
            if ex_env:
                excluded = [s.strip() for s in ex_env.split(',') if s.strip()]
        excluded = (excluded or []) + ALWAYS_EXCLUDED
        excluded_js = json.dumps(excluded, ensure_ascii=False)
        # В SAFE-режиме не добавляем тяжёлые скрипты фильтра вообще — фильтрация будет на стороне парсера
        try:
            unsafe = bool(getattr(args, 'unsafe', False) or (os.getenv('AUTOBET_UNSAFE') not in (None, '', '0', 'false', 'False')))
        except Exception:
            unsafe = False
        globals()['SAFE_MODE'] = (not unsafe)
        if not globals()['SAFE_MODE']:
            # Только когда явно выключили SAFE, добавляем фильтрацию на страницу
            try:
                light = bool(os.getenv('AUTOBET_LIGHT') not in (None, '', '0', 'false', 'False') or getattr(args, 'light', False))
            except Exception:
                light = False
            page.evaluate((FILTER_JS_LIGHT if light else FILTER_JS) % {"allowed": allowed_js, "excluded": excluded_js})
        # Обновим список лиг с текущей страницы
        try:
            _update_known_leagues_from_page(page)
        except Exception:
            pass

        # Логи консоли страницы: по умолчанию показываем только наши сообщения с префиксом 'AUTO:'
        if not getattr(args, 'headless', False):
            try:
                def _console(msg):
                    try:
                        text = getattr(msg, "text", None)
                        ctype = getattr(msg, "type", None)
                        if callable(text):
                            text = text()
                        if callable(ctype):
                            ctype = ctype()
                        # По умолчанию печатаем только наши логи (AUTO:…)
                        # Полный поток — только при AUTOBET_CONSOLE_ALL=1
                        if (os.getenv("AUTOBET_CONSOLE_ALL") not in (None, '', '0', 'false', 'False') ) or (isinstance(text, str) and "AUTO:" in text):
                            print(f"[console:{ctype}] {text}")
                    except Exception:
                        pass
                page.on("console", _console)
            except Exception:
                pass

        # Экспортируем функцию перезапуска в страницу и рендерим кнопку управления
        # Мгновенное завершение по Enter (в интерактивном TTY по умолчанию)
        stop_event = threading.Event()
        # Активируем ожидание Enter в интерактивном TTY (по умолчанию)
        if (not getattr(args, 'headless', False)) and sys.stdin and sys.stdin.isatty():
            def _wait_for_enter():
                try:
                    input()
                except Exception:
                    pass
                try:
                    print("[exit] Пользователь нажал Enter — завершаю…")
                except Exception:
                    pass
                try:
                    stop_event.set()
                except Exception:
                    pass
                # Попробуем корректно закрыть контекст/браузер и завершить процесс
                try:
                    context.close()
                except Exception:
                    pass
                try:
                    os._exit(0)
                except Exception:
                    sys.exit(0)

            try:
                t = threading.Thread(target=_wait_for_enter, daemon=True)
                t.start()
                print("Нажмите Enter для немедленного завершения (live-сбор)")
            except Exception:
                pass
            def _restart_from_ui():
                # ВАЖНО: Playwright sync API не потокобезопасен —
                # выполняем restart_scan в том же потоке, что и контекст/страница
                try:
                    restart_scan(context, page, filters, stop_event)
                    return True
                except Exception:
                    return False

            try:
                page.expose_function("autobetRestart", _restart_from_ui)
                # Пауза/продолжить
                def _toggle_pause():
                    try:
                        globals()['_PAUSED'] = not globals().get('_PAUSED', False)
                        return bool(globals()['_PAUSED'])
                    except Exception:
                        return False
                page.expose_function("autobetTogglePause", _toggle_pause)
            except Exception:
                # Если уже экспортирована — игнорируем
                pass
            try:
                page.evaluate(CONTROL_JS)
                page.evaluate("console.info('AUTO:controls ready')")
            except Exception:
                pass

        # Учитываем флаги fresh/details
        try:
            globals()['_IGNORE_PROCESSED'] = bool(getattr(args, 'fresh', False) or (os.getenv('AUTOBET_FRESH') not in (None, '', '0', 'false', 'False')))
            if globals()['_IGNORE_PROCESSED']:
                print("[fresh] processed_* будет проигнорирован для этого запуска")
            globals()['_SHOW_DETAILS'] = bool(getattr(args, 'details', False) or (os.getenv('AUTOBET_DETAILS') not in (None, '', '0', 'false', 'False')))
            globals()['DRIVE_UI'] = bool(getattr(args, 'drive_ui', False) or (os.getenv('AUTOBET_DRIVE_UI') not in (None, '', '0', 'false', 'False')))
            if globals()['DRIVE_UI']:
                print("[ui] Режим drive-ui: навигация по /stats в видимой вкладке")
        except Exception:
            pass

        # Первый прогон
        try:
            _dbg('scan', 'initial restart_scan start')
            restart_scan(context, page, filters, stop_event)
            _dbg('scan', 'initial restart_scan end')
        except Exception as e:
            print(f"[scan] Ошибка первого прогона: {e}")

        # Фоновый режим: переcкан списка каждые interval_sec в течение bg_minutes
        try:
            bg_minutes = getattr(args, 'bg_minutes', None)
            interval_sec = getattr(args, 'bg_interval', None)
            score_interval_sec = getattr(args, 'score_interval', 20)
        except Exception:
            bg_minutes, interval_sec, score_interval_sec = None, None, 20

        if bg_minutes is None:
            bg_minutes = 30
        if interval_sec is None:
            interval_sec = 60
        # Предохраняемся от слишком частых пересканов (0 секунд)
        try:
            if float(interval_sec) < 10:
                print(f"[bg] Предупреждение: слишком маленький интервал ({interval_sec}s). Ставлю минимум 10s, чтобы страница успевала обновляться.")
                interval_sec = 10
        except Exception:
            interval_sec = 10

        # Минимум на счёт: 10 сек, чтобы не душить страницу
        try:
            if float(score_interval_sec) < 10:
                score_interval_sec = 10
        except Exception:
            score_interval_sec = 20

        print(f"[bg] Запуск фонового сканирования: {bg_minutes} мин, шаг {interval_sec} сек; обновление счёта каждые {score_interval_sec} сек")
        deadline = time.monotonic() + bg_minutes * 60
        try:
            last_score_refresh = time.monotonic()
            while time.monotonic() < deadline and not stop_event.is_set():
                if globals().get('_PAUSED', False):
                    print("[pause] Тик пропущен — режим Пауза")
                    time.sleep(max(2, int(interval_sec)))
                    continue
                try:
                    page.evaluate("console.info('AUTO:bg tick')")
                except Exception:
                    pass
                try:
                    # По запросу — полная перезагрузка live_v2 перед каждым сканом
                    do_reload = False
                    try:
                        do_reload = getattr(args, 'reload', False)
                    except Exception:
                        do_reload = False
                    if not do_reload and os.getenv('AUTOBET_RELOAD'):
                        do_reload = True
                    if do_reload:
                        try:
                            page.goto(URL, wait_until="domcontentloaded", timeout=20000)
                            # Переинъекция фильтра после reload
                            allowed_js = json.dumps(filters or DEFAULT_FILTERS, ensure_ascii=False)
                            try:
                                excl = getattr(args, 'exclude', None)
                            except Exception:
                                excl = None
                            if not excl:
                                ex_env = os.getenv('AUTOBET_EXCLUDE', '')
                                if ex_env:
                                    excl = [s.strip() for s in ex_env.split(',') if s.strip()]
                            excluded_js = json.dumps(excl or [], ensure_ascii=False)
                            page.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
                        except Exception as e:
                            print(f"[bg] warn: reload failed: {e}")
                    restart_scan(context, page, filters, stop_event)
                except Exception as e:
                    print(f"[bg] ошибка цикла: {e}")
                # Спим мелкими шагами, чтобы Ctrl+C отзывался быстрее
                slept = 0.0
                # Более частые проверки для мгновенной остановки по Enter
                while slept < interval_sec and not stop_event.is_set():
                    step = 0.1 if interval_sec >= 0.1 else interval_sec
                    time.sleep(step)
                    slept += step
                    # Лёгкое обновление счёта каждые score_interval_sec секунд без полного скана
                    try:
                        now = time.monotonic()
                        if now - last_score_refresh >= float(score_interval_sec):
                            try:
                                # Обновим текущие счёты из live списка, не открывая /stats
                                links_soft = []
                                try:
                                    links_soft = collect_filtered_stats_links(page)
                                except Exception:
                                    links_soft = globals().get('_LAST_LIVE_LINKS') or []
                                if links_soft:
                                    _refresh_live_scores(links_soft)
                                last_score_refresh = now
                            except Exception:
                                last_score_refresh = now
                    except Exception:
                        pass
        except KeyboardInterrupt:
            pass
        print("[bg] Завершение фонового сканирования")


def main() -> int:
    args = build_arg_parser().parse_args()
    filters = args.filters or DEFAULT_FILTERS
    try:
        run(filters)
        return 0
    except KeyboardInterrupt:
        return 0
    except ModuleNotFoundError:
        print("Playwright не установлен. Установите зависимости:")
        print("  pip install playwright")
        print("  playwright install")
        return 1
    except Exception as e:
        print(f"Ошибка: {e}")
        print("Подсказка: убедитесь, что установлены зависимости: 'pip install playwright' и выполните 'playwright install'")
        return 1


# ---------------------- helpers ----------------------

def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Open tennis live page with auto-filter and login")
    parser.add_argument("filters", nargs="*", help="Список строк для фильтрации по колонке 'Турнир'")
    parser.add_argument("--exclude", dest="exclude", nargs="*",
                        help="Исключить турниры (подстроки). Можно также через переменную AUTOBET_EXCLUDE=\"A,B,C\"")
    parser.add_argument("--email", dest="email", help="Email для авторизации (иначе TENNIS_EMAIL или значение по умолчанию)")
    parser.add_argument("--password", dest="password", help="Пароль для авторизации (иначе TENNIS_PASSWORD или значение по умолчанию)")
    parser.add_argument(
        "--extension-path",
        dest="extension_path",
        default=DEFAULT_EXTENSION_PATH,
        help="Путь к Chrome-расширению (будет загружено в persistent-профиль)",
    )
    parser.add_argument("--no-extension", dest="no_extension", action="store_true",
                        help="Запуск без загрузки расширения (подходит для серверов и headless)")
    parser.add_argument("--server-perf", dest="server_perf", action="store_true",
                        help="Упрощённый режим встраивания (снижение нагрузки контент‑скрипта)")
    # Фоновый режим (без окон): поддерживаем краткую форму -fon и длинную --headless
    parser.add_argument("-fon", "--headless", dest="headless", action="store_true",
                        help="Запуск Chromium в фоне (без окон). Требует поддержку headless-режима для расширений.")
    parser.add_argument("--fonbet-login", dest="fonbet_login", help="Логин (email/телефон) для fon.bet (или FONBET_LOGIN)")
    parser.add_argument("--fonbet-password", dest="fonbet_password", help="Пароль для fon.bet (или FONBET_PASSWORD)")
    parser.add_argument("--bg-minutes", dest="bg_minutes", type=int, default=30, help="Сколько минут сканировать в фоне (по умолчанию 30)")
    parser.add_argument("--bg-interval", dest="bg_interval", type=int, default=60, help="Интервал между пересканами, сек (по умолчанию 60)")
    parser.add_argument("--score-interval", dest="score_interval", type=int, default=20,
                        help="Как часто обновлять счёт между сканами, сек (по умолчанию 20)")
    parser.add_argument("--tty-exit", dest="tty_exit", action="store_true",
                        help="Разрешить мгновенный выход по Enter в терминале (по умолчанию выключено)")
    parser.add_argument("--decision-wait-ms", dest="decision_wait_ms", type=int, default=2000,
                        help="Сколько миллисекунд ждать отрисовку блока решения (по умолчанию 2000)")
    parser.add_argument("--fresh", dest="fresh", action="store_true", help="Игнорировать processed_* и пересканировать все найденные ссылки заново")
    parser.add_argument("--pre-collect-ms", dest="pre_collect_ms", type=int, default=400, help="Пауза перед сбором ссылок со страницы live, мс")
    parser.add_argument("--post-open-ms", dest="post_open_ms", type=int, default=400, help="Пауза после открытия страницы статистики, мс")
    parser.add_argument("--details", dest="details", action="store_true", help="Добавлять строку с пояснениями ℹ️ (по умолчанию выключено)")
    parser.add_argument("--prematch", dest="prematch", action="store_true",
                        help="Также парсить up-games (PREMATCH) и сохранять в prema_3of3.csv")
    # Telegram options
    parser.add_argument("-tg", "--tg", dest="tg", action="store_true", help="Отправлять подходящие матчи в Telegram")
    parser.add_argument("--tg-token", dest="tg_token", default=os.getenv("TELEGRAM_BOT_TOKEN", TG_DEFAULT_TOKEN), help="Telegram Bot API token (или TELEGRAM_BOT_TOKEN)")
    parser.add_argument("--tg-chat", dest="tg_chat", default=os.getenv("TELEGRAM_CHAT_ID"), help="Telegram chat id (или TELEGRAM_CHAT_ID)")
    # Режим: сохранять и отправлять ВСЕ матчи, игнорируя условие GO/3/3/2/3; также отключает фильтр турниров
    parser.add_argument("-all", "--all", dest="all", action="store_true",
                        help="Парсить все матчи (без условия GO/3/3/2/3) и отправлять все страницы статистики. Отключает фильтрацию по турнирам.")
    # Отправлять все матчи, но без снятия фильтра турниров (в отличие от --all)
    parser.add_argument("--notify-all", dest="notify_all", action="store_true",
                        help="Отправлять все найденные страницы статистики (игнорировать GO/3/3/2/3), но сохранять фильтр по турнирам")
    # Жёсткая перезагрузка live-страницы перед каждым циклом сканирования
    parser.add_argument("--reload", dest="reload", action="store_true",
                        help="Перезагружать live_v2 перед каждым фоновым циклом (на случай если список не обновляется)")
    # Фильтр по вердикту: скрывать PASS из уведомлений
    parser.add_argument("--hide-pass", dest="hide_pass", action="store_true",
                        help="Не отправлять уведомления для матчей с вердиктом 🔴 PASS")
    return parser


def parse_args_for_runtime():
    # Lightweight re-parse to be available in run() without changing signature
    return build_arg_parser().parse_args()


def is_logged_in(page) -> bool:
    try:
        # Признак авторизации на tennis-score.pro – видна ссылка "Выйти"
        logout_link = page.locator("a[href='/?logout=yes'], a.logout:has-text('Выйти')").first
        if logout_link.is_visible(timeout=800):
            return True
    except Exception:
        pass
    return False


def try_login(page, email: str, password: str) -> bool:
    try:
        # Явные селекторы, предоставленные вами
        # Страница: https://tennis-score.pro/login/
        login_input = page.locator("input[name='USER_LOGIN']#name, input#name[name='USER_LOGIN']").first
        pass_input = page.locator("input[name='USER_PASSWORD']#password, input#password[name='USER_PASSWORD']").first

        # Если этих полей не видно, попробуем альтернативные, но сначала нажмём "Войти", если есть
        if not login_input.is_visible(timeout=800) or not pass_input.is_visible(timeout=800):
            for sel in (
                "a:has-text('Войти')",
                "button:has-text('Войти')",
                "a:has-text('Login')",
                "button:has-text('Login')",
            ):
                try:
                    page.locator(sel).first.click(timeout=800)
                    break
                except Exception:
                    continue
            # Переоценим локаторы
            login_input = page.locator("input[name='USER_LOGIN']#name, input#name[name='USER_LOGIN']").first
            pass_input = page.locator("input[name='USER_PASSWORD']#password, input#password[name='USER_PASSWORD']").first

        # Если всё ещё нет — попробуем универсальные поля
        if not login_input.is_visible(timeout=800):
            login_input = page.locator("input[type='text'][name], input[type='email'][name]").first
        if not pass_input.is_visible(timeout=800):
            pass_input = page.locator("input[type='password'][name]").first

        login_input.wait_for(state="visible", timeout=5000)
        pass_input.wait_for(state="visible", timeout=5000)

        login_input.fill(email)
        pass_input.fill(password)

        # Нажимаем кнопку "Войти" или submit
        submitted = False
        for sel in (
            "button[type='submit']",
            "input[type='submit']",
            "button:has-text('Войти')",
            "input[value='Войти']",
        ):
            try:
                page.locator(sel).first.click(timeout=1200)
                submitted = True
                break
            except Exception:
                continue
        if not submitted:
            pass_input.press("Enter")

        # Ожидаем появление признака авторизации
        for _ in range(6):  # до ~6 секунд
            if is_logged_in(page):
                return True
            page.wait_for_timeout(1000)
        return False
    except Exception:
        return False


def ensure_login(context, page, email: str, password: str) -> bool:
    # Already logged in?
    try:
        if is_logged_in(page):
            return True
    except Exception:
        pass

    # Если уже есть "Выйти" — авторизованы
    try:
        if page.locator("a[href='/?logout=yes'], a.logout:has-text('Выйти')").first.is_visible(timeout=800):
            return True
    except Exception:
        pass

    # Перейдём на страницу логина
    try:
        page.goto("https://tennis-score.pro/login/", wait_until="domcontentloaded", timeout=10000)
    except Exception:
        pass

    # Попробуем залогиниться на текущей странице
    if try_login(page, email, password) and is_logged_in(page):
        try:
            # Save state for non-persistent contexts
            if hasattr(context, "storage_state"):
                context.storage_state(path=AUTH_STATE_PATH)
        except Exception:
            pass
        # Всегда возвращаемся на страницу с фильтрами
        try:
            page.goto(URL, wait_until="domcontentloaded")
        except Exception:
            pass
        return True

    # Если не получилось — попробуем насильно выйти (если видим ссылку) и снова войти
    try:
        logout_link = page.locator("a[href='/?logout=yes'], a.logout:has-text('Выйти')").first
        if logout_link.is_visible(timeout=800):
            logout_link.click()
            page.wait_for_url(re.compile(r".*/login/?"), timeout=8000)
            if try_login(page, email, password) and is_logged_in(page):
                try:
                    if hasattr(context, "storage_state"):
                        context.storage_state(path=AUTH_STATE_PATH)
                except Exception:
                    pass
                page.goto(URL, wait_until="domcontentloaded")
                return True
    except Exception:
        pass

    # Try within iframes (some sites render auth in modal/iframe)
    try:
        for frame in page.frames:
            try:
                if try_login(frame, email, password) and is_logged_in(page):
                    try:
                        if hasattr(context, "storage_state"):
                            context.storage_state(path=AUTH_STATE_PATH)
                    except Exception:
                        pass
                    return True
            except Exception:
                continue
    except Exception:
        pass

    return False


# ---------------------- scanning/saving ----------------------

def collect_filtered_stats_links(page) -> List[str]:
    # First, if our extension panel is present, harvest scores from it
    try:
        panel = page.evaluate(
            """
            () => {
              const box = document.getElementById('tsx-live-panel');
              if (!box) return null;
              const rows = Array.from(box.querySelectorAll('.row'));
              const out = {};
              for (const r of rows) {
                const u = r.getAttribute('data-url');
                if (!u) continue;
                const sc = r.getAttribute('data-score') || '';
                const st = r.getAttribute('data-sets') || '';
                const fin = r.getAttribute('data-finished') === '1';
                out[u] = { score: sc, sets: st.split('|').filter(Boolean), finished: !!fin };
              }
              return out;
            }
            """
        )
        if isinstance(panel, dict):
            for u, d in panel.items():
                try:
                    key = _canonical_stats_url(u) if isinstance(u, str) else u
                except Exception:
                    key = u
                try:
                    sc = d.get('score') or None
                except Exception:
                    sc = None
                if sc:
                    _LIVE_SCORE_BY_URL[key] = sc
                try:
                    arr = d.get('sets') or []
                    if isinstance(arr, list) and arr:
                        _LIVE_SETS_BY_URL[key] = [str(x) for x in arr]
                except Exception:
                    pass
                try:
                    _LIVE_FINISHED_BY_URL[key] = bool(d.get('finished'))
                except Exception:
                    pass
                # также сохраним левое/правое имя из параметров lp/rp для ориентации фаворита
                try:
                    q = parse_qs(urlparse(str(key)).query)
                    lp = (q.get('lp') or [None])[0]
                    rp = (q.get('rp') or [None])[0]
                    _LIVE_LR_BY_URL[key] = (lp, rp)
                except Exception:
                    pass
    except Exception:
        pass
    base = "https://tennis-score.pro"
    # Собираем видимые ссылки на страницу статистики из всех фреймов (не заходя в Playwright frame API)
    hrefs = []
    seen = set()
    try:
        urls_from_frames = page.evaluate(
            r"""
            () => {
              const out = [];
              const collect = (doc) => {
                try {
                  const as = Array.from(doc.querySelectorAll('a[href*="/stats/?"]'));
                  for (const a of as) {
                    try {
                      if (a.closest('.__auto-filter-hidden__')) continue;
                      const href = a.getAttribute('href') || '';
                      if (!href || href.startsWith('#')) continue;
                      // try to read row text (league/tournament name lives in the same row)
                      const row = a.closest('tr') || a.closest('[role="row"]') || a.closest('.row') || a.closest('li') || a.closest('.match') || a.parentElement;
                      const rowText = row ? (row.innerText||row.textContent||'').replace(/\s+/g,' ').trim() : '';
                      out.push({ href, rowText });
                    } catch {}
                  }
                } catch {}
              };
              collect(document);
              const ifrs = Array.from(document.querySelectorAll('iframe'));
              for (const f of ifrs) {
                try { if (f.contentDocument) collect(f.contentDocument); } catch {}
              }
              return out;
            }
            """
        ) or []
        if isinstance(urls_from_frames, list) and urls_from_frames:
            for item in urls_from_frames:
                try:
                    if isinstance(item, dict):
                        href = item.get('href')
                        row_text_full = item.get('rowText') or ''
                    else:
                        href = item
                        row_text_full = ''
                    if not isinstance(href, str):
                        continue
                    abs_url = urljoin(base, href)
                    if abs_url in seen:
                        continue
                    seen.add(abs_url)
                    hrefs.append(abs_url)
                    try:
                        canon = _canonical_stats_url(abs_url)
                        _LIVE_LAST_SEEN[canon] = time.monotonic()
                    except Exception:
                        pass
                    # Try attach league by matching known leagues in the row text
                    try:
                        if _KNOWN_LEAGUES and row_text_full:
                            for name in sorted(_KNOWN_LEAGUES, key=len, reverse=True):
                                if isinstance(name, str) and name and name in row_text_full:
                                    _LEAGUE_BY_URL[abs_url] = name
                                    break
                    except Exception:
                        pass
                except Exception:
                    continue
            if hrefs:
                _dbg('collect', f'collected (fast) {len(hrefs)} link(s)')
                return hrefs
    except Exception:
        pass
    # Далее — уточнение по основному фрейму, плюс попытка собрать счёт из строки
    anchors = page.locator("a[href*='/stats/?']")
    count = anchors.count()
    _dbg('collect', f'anchors total={count}')
    # quick visibility estimate from page-world
    try:
        vis_cnt = page.evaluate(
            '() => Array.from(document.querySelectorAll("a[href*=\\"/stats/?\\\"]")).filter(a => {\n'
            '  try {\n'
            '    const rects=a.getClientRects();\n'
            '    const cs=getComputedStyle(a);\n'
            '    const hidden = !!a.closest(".__auto-filter-hidden__") || a.hasAttribute("hidden") || a.getAttribute("aria-hidden")==="true";\n'
            '    return !hidden && rects.length>0 && cs.visibility!=="hidden" && cs.display!=="none";\n'
            '  } catch { return false; }\n'
            '}).length'
        )
        _dbg('collect', f'visible anchors quick={vis_cnt}')
    except Exception:
        pass
    for i in range(count):
        a = anchors.nth(i)
        try:
            # пропустим элементы внутри скрытых строк фильтра
            hidden = a.evaluate(
                "el => { try {\n"
                "  const rects=el.getClientRects();\n"
                "  const cs=getComputedStyle(el);\n"
                "  const h = !!el.closest('.__auto-filter-hidden__') || el.hasAttribute('hidden') || el.getAttribute('aria-hidden')==='true' || rects.length===0 || cs.visibility==='hidden' || cs.display==='none';\n"
                "  return !!h;\n"
                "} catch { return true; } }"
            )
            if hidden:
                _dbg('collect', f'skip hidden #{i}')
                continue
            # Определим контейнер строки и соберём текст
            row_text = a.evaluate(
                r"el => { const r = el.closest('tr') || el.closest('[role=\"row\"]') || el.closest('.row') || el.closest('li') || el.closest('.match') || el; return (r.innerText||r.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(); }"
            ) or ""
            row_text_full = a.evaluate(
                r"el => { const r = el.closest('tr') || el.closest('[role=\"row\"]') || el.closest('.row') || el.closest('li') || el.closest('.match') || el; return (r.innerText||r.textContent||'').replace(/\s+/g,' ').trim(); }"
            ) or ""
            # Дополнительный жёсткий фильтр по турнирам (если задан список)
            try:
                allowed = [s for s in (globals().get('_ALLOWED_TOURNAMENTS') or []) if isinstance(s, str) and s.strip()]
            except Exception:
                allowed = []
            if allowed:
                low = row_text_full.lower()
                if not any(s.lower() in low for s in allowed):
                    _dbg('collect', f'skip by tournament #{i}')
                    continue
            # Эвристика LIVE: присутствуют признаки счёта/процесса
            has_score = bool(re.search(r"\b([0-5])\s*[:\-–—]\s*([0-5])\b", row_text))
            live_markers = ("лайв" in row_text) or ("live" in row_text) or ("идет" in row_text) or ("идёт" in row_text) or ("сет" in row_text)
            # Эвристика PREMATCH: индикаторы будущего начала
            prem_markers = ("прематч" in row_text) or ("up-games" in row_text) or ("начало" in row_text) or ("начнется" in row_text) or ("начнётся" in row_text) or ("через" in row_text and "мин" in row_text)
            if prem_markers and not (has_score or live_markers):
                # Похоже на предматч — пропустим
                _dbg('collect', f'skip prematch #{i}')
                continue

            href = a.get_attribute("href") or ""
            if not href or href.startswith("#"):
                continue
            abs_url = urljoin(base, href)
            if abs_url in seen:
                continue
            seen.add(abs_url)
            hrefs.append(abs_url)
            _dbg('collect', f'+ {abs_url}')
            # Try to capture current live score from the same row for this URL
            try:
                score_info = a.evaluate(
                    r"el => {\n"
                    r"  const row = el.closest('tr') || el.closest('[role=\"row\"]') || el.closest('.row') || el.closest('li') || el.closest('.match') || el.parentElement;\n"
                    r"  if (!row) return null;\n"
                    r"  const td = row.querySelector('td.td-mob.mob-score, .td-mob.mob-score, .mob-score');\n"
                    r"  const blocks = td ? Array.from(td.querySelectorAll('.score')).slice(0,2) : [];\n"
                    r"  // read first .sum per block, ignore duplicates\n"
                    r"  const readSum = (b)=>{ const d=b&&b.querySelector('.sum'); if(!d) return null; const t=(d.textContent||'').trim(); const n=parseInt(t,10); return Number.isFinite(n)? n : (t||null); };\n"
                    r"  const sA = readSum(blocks[0]);\n"
                    r"  const sB = readSum(blocks[1]);\n"
                    r"  const finished = (sA!=null && sB!=null) && (Number(sA)===3 || Number(sB)===3);\n"
                    r"  const score = (sA!=null && sB!=null) ? `${sA}:${sB}` : null;\n"
                    r"  // collect per-set points for both players, pairwise\n"
                    r"  const setsA = (blocks[0] ? Array.from(blocks[0].querySelectorAll('.set')).map(x => (x.textContent||'').trim()) : []);\n"
                    r"  const setsB = (blocks[1] ? Array.from(blocks[1].querySelectorAll('.set')).map(x => (x.textContent||'').trim()) : []);\n"
                    r"  const n = Math.min(setsA.length, setsB.length);\n"
                    r"  const pairs = [];\n"
                    r"  for (let i=0;i<n;i++){ pairs.push(`${setsA[i]}:${setsB[i]}`); }\n"
                    r"  // Fallback: if no explicit score detected, try to parse 'X:Y' from row text (live list doesn't contain 'топ-счёт')\n"
                    r"  if (!score) {\n"
                    r"    const tx = (row.innerText||row.textContent||'').replace(/\s+/g,' ').trim();\n"
                    r"    const m = tx.match(/\b([0-5])\s*[:\-–—]\s*([0-5])\b/);\n"
                    r"    if (m) { score = `${m[1]}:${m[2]}`; }\n"
                    r"  }\n"
                    r"  // try read two visible name-like nodes from row\n"
                    r"  const pickText = (el)=> (el ? (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim() : '');\n"
                    r"  const nameNodes = Array.from(row.querySelectorAll('.player, .name, .team, .competitor, .competitor-name, .name-player, .player-name'));\n"
                    r"  const names = [];\n"
                    r"  for (const n of nameNodes){ const t = pickText(n); if (t && t.length>=2 && !names.includes(t)) names.push(t); if (names.length>=2) break; }\n"
                    r"  return { score, active:true, finished, pairs, names };\n"
                    
                    r"}"
                )
                if isinstance(score_info, dict):
                    sc = score_info.get('score')
                    if sc:
                        _LIVE_SCORE_BY_URL[abs_url] = sc
                        _LIVE_FINISHED_BY_URL[abs_url] = bool(score_info.get('finished'))
                    try:
                        pairs = score_info.get('pairs') or []
                        def _trim_pairs(ps):
                            arr = []
                            for it in ps:
                                try:
                                    s = str(it)
                                    a,b = s.split(':',1)
                                    a=a.strip(); b=b.strip()
                                    arr.append(f"{a}:{b}")
                                except Exception:
                                    continue
                            # remove trailing 0:0 pairs
                            while arr and re.match(r"^0\s*:\s*0$", arr[-1]):
                                arr.pop()
                            return arr
                        if isinstance(pairs, list) and pairs:
                            _LIVE_SETS_BY_URL[abs_url] = _trim_pairs(pairs)
                        if os.getenv('AUTOBET_DEBUG'):
                            try:
                                sets_dbg = ", ".join(_LIVE_SETS_BY_URL.get(abs_url, []))
                                print(f"[score] {abs_url} -> {sc or '—'}{(' ('+sets_dbg+')') if sets_dbg else ''}")
                            except Exception:
                                pass
                    except Exception:
                        pass
                elif os.getenv('AUTOBET_DEBUG'):
                    try:
                        print(f"[score] {abs_url} -> no mob-score in row")
                    except Exception:
                        pass
                    try:
                        names = score_info.get('names') or []
                        if isinstance(names, list) and names:
                            _LIVE_NAMES_BY_URL[abs_url] = [str(x) for x in names if isinstance(x, str)][:2]
                    except Exception:
                        pass
            except Exception:
                pass
            # Try to attach league name for this URL using known leagues
            try:
                if _KNOWN_LEAGUES and row_text_full:
                    # choose the longest matching league name to avoid partials
                    for name in sorted(_KNOWN_LEAGUES, key=len, reverse=True):
                        if name and name in row_text_full:
                            _LEAGUE_BY_URL[abs_url] = name
                            break
            except Exception:
                pass
        except Exception:
            continue
    return hrefs


def expand_live_list(page, max_scrolls: int = 20, pause_ms: int = 300) -> None:
    """Прокручивает страницу/контейнер вниз, чтобы подгрузить виртуализованные строки.
    Также пытается нажимать кнопки "Показать ещё/ещё/More"."""
    try:
        # Нажать возможные кнопки 'Показать ещё'
        for _ in range(3):
            clicked = False
            for sel in (
                "button:has-text('Показать ещё')",
                "button:has-text('Показать еще')",
                "button:has-text('Еще')",
                "button:has-text('More')",
                "a:has-text('Показать ещё')",
                "a:has-text('Показать еще')",
                "a:has-text('Еще')",
                "a:has-text('More')",
            ):
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=200):
                        btn.click(timeout=500)
                        _dbg('expand', f"Clicked '{sel}'")
                        clicked = True
                        page.wait_for_timeout(pause_ms)
                        break
                except Exception:
                    continue
            if not clicked:
                break

        # Прокрутка страницы для загрузки виртуализованных элементов (щадяще)
        last_height = 0
        max_scrolls = max(3, min(max_scrolls, 8))
        for _ in range(max_scrolls):
            height = page.evaluate("() => document.scrollingElement ? document.scrollingElement.scrollHeight : document.body.scrollHeight")
            if not isinstance(height, (int, float)):
                break
            if height <= last_height:
                break
            last_height = height
            page.evaluate("h => window.scrollTo(0, h)", height)
            page.wait_for_timeout(pause_ms)
            _dbg('expand', f"window scroll to {height}")

        # Дополнительно: прокрутим потенциально прокручиваемые контейнеры (overflow-y: auto/scroll)
        try:
            scrolled_cnt = page.evaluate(
                r"""
                () => {
                  const isScrollable = (el) => {
                    try { const st = getComputedStyle(el); const oy = st.overflowY; return /(auto|scroll)/.test(oy) && (el.scrollHeight - el.clientHeight > 20); } catch { return false; }
                  };
                  const cand = Array.from(document.querySelectorAll('div,main,section,ul,table,tbody'))
                    .filter(isScrollable)
                    .sort((a,b)=> (b.scrollHeight-b.clientHeight) - (a.scrollHeight-a.clientHeight))
                    .slice(0,3);
                  cand.forEach(el => { try { el.scrollTop = el.scrollHeight; } catch {} });
                  return cand.length;
                }
                """
            )
            try:
                _dbg('expand', f"scrolled {int(scrolled_cnt)} scrollable containers")
            except Exception:
                pass
        except Exception:
            pass
    except Exception:
        pass

def expand_live_list_all_frames(page, max_scrolls: int = 20, pause_ms: int = 300) -> None:
    try:
        expand_live_list(page, max_scrolls=max_scrolls, pause_ms=pause_ms)
    except Exception:
        pass
    try:
        for fr in page.frames:
            try:
                if fr == page.main_frame:
                    continue
                expand_live_list(fr, max_scrolls=max_scrolls, pause_ms=pause_ms)
            except Exception:
                continue
    except Exception:
        pass


def extract_favorite_and_opponents(page, lp: Optional[str] = None, rp: Optional[str] = None) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    # Возвращает (favorite, opponent, page_title_or_header, reason) если на странице есть
    # одно из условий: "Решение: GO" или "Совпадений по 3-окну: 3/3" или "Совпадений по 3-окну: 2/3"
    # Сначала ориентируемся на блок с классом .take-two-sets, как в примере
    source_text = ""
    try:
        block = page.locator(".take-two-sets").first
        if block.count() > 0 and block.is_visible(timeout=1500):
            source_text = block.inner_text(timeout=3000)
    except Exception:
        pass

    # Если блока нет — попробуем fallback на body (некоторые версии разметки/эмодзи в заголовке)
    if not source_text:
        try:
            source_text = page.locator("body").inner_text(timeout=3000)
        except Exception:
            source_text = ""
        if not source_text:
            return (None, None, None, None)

    # 1) Проверяем условия
    # Разрешаем разные типы дефиса: -, ‑, –, —
    hy = r"[-‑–—]"
    # Разрешаем лидирующие эмодзи/символы: ищем без якоря начала строки
    has_go = re.search(r"Решение\s*:\s*GO\b", source_text, re.IGNORECASE) is not None
    # Поддерживаем и старую, и сокращённую формулировку
    has_33 = (
        re.search(rf"Совпадений\s*по\s*3{hy}окну\s*:\s*3/3\b", source_text, re.IGNORECASE) is not None
        or re.search(r"Совпадений\s*:\s*3/3\b", source_text, re.IGNORECASE) is not None
    )
    has_23 = (
        re.search(rf"Совпадений\s*по\s*3{hy}окну\s*:\s*2/3\b", source_text, re.IGNORECASE) is not None
        or re.search(r"Совпадений\s*:\s*2/3\b", source_text, re.IGNORECASE) is not None
    )

    # Если нет явного решения GO/3/3/2/3, в обычном режиме прерываемся.
    # В режиме ALLOW_NOTIFY_ALL продолжим попытку извлечь имена, чтобы отправить матч.
    if not (has_go or has_33 or has_23):
        if not (globals().get('ALLOW_NOTIFY_ALL') or globals().get('ALLOW_ALL')):
            return (None, None, None, None)

    # 2) Пытаемся вытащить фаворита отдельно (если блок с фаворитом присутствует)
    fav = None
    m_fav = re.search(r"Фаворит\s*:\s*([^\n\r]+)", source_text, re.IGNORECASE)
    if m_fav:
        fav = (m_fav.group(1) or "").strip()

    # Пытаемся найти имена игроков
    candidates = []
    selectors = [
        ".player-name",
        ".player .name",
        ".name-player",
        "[class*='player'] [class*='name']",
        ".competitor .name",
        ".competitor-name",
        ".team .name",
        "h1",
        "h2",
    ]
    for sel in selectors:
        try:
            loc = page.locator(sel)
            n = min(loc.count(), 6)
            for i in range(n):
                t = loc.nth(i).inner_text().strip()
                if t and len(t) >= 3 and not t.lower().startswith("решение"):
                    candidates.append(t)
        except Exception:
            continue

    # Удаляем дубликаты, берём первые две разумные строки
    uniq = []
    for t in candidates:
        if t not in uniq and len(t) <= 80:
            uniq.append(t)
    players = uniq[:2]

    title = None
    try:
        title = page.title()
    except Exception:
        pass

    opponent = None
    # Если в URL есть lp/rp — используем их как игроков
    if fav and (lp or rp):
        # Сопоставим по точному совпадению
        if lp and fav == lp and rp:
            opponent = rp
        elif rp and fav == rp and lp:
            opponent = lp
        else:
            # Попробуем без учёта регистра/пробелов
            def norm(s):
                return re.sub(r"\s+", " ", s or "").strip().lower()
            if lp and norm(fav) == norm(lp) and rp:
                opponent = rp
            elif rp and norm(fav) == norm(rp) and lp:
                opponent = lp
    # Если из URL не вышло — попробуем по заголовкам на странице
    if opponent is None and fav and players:
        if players[0] == fav and len(players) > 1:
            opponent = players[1]
        elif len(players) > 1 and players[1] == fav:
            opponent = players[0]
        elif len(players) > 1:
            opponent = players[1]
    # Если фаворит не найден — не сохраняем
    if not fav or not opponent:
        return (None, None, title, None)

    reason_bits = []
    if has_go:
        reason_bits.append("GO")
    if has_33:
        reason_bits.append("3/3")
    if has_23:
        reason_bits.append("2/3")
    reason = " ".join(reason_bits) if reason_bits else None

    return (fav, opponent, title, reason)


def scan_and_save_stats(context, links: List[str], output_csv: str, processed_path: str, stop_event: Optional[threading.Event] = None) -> None:
    processed = load_processed_urls(processed_path)
    skipped_processed = 0
    visited = 0
    saved = 0
    for url in links:
        if stop_event is not None and stop_event.is_set():
            print("[stop] Прервано пользователем (Enter)")
            break
        if url in processed:
            skipped_processed += 1
            if os.getenv("AUTOBET_DEBUG"):
                print(f"[skip:processed] {url}")
            continue
        try:
            if globals().get('DRIVE_UI') and context.pages:
                page = context.pages[0]
                try:
                    page.bring_to_front()
                except Exception:
                    pass
            else:
                page = context.new_page()
            # На вкладках /stats проверяем маркер скрипта (без принудительной инъекции)
            try:
                ok = page.evaluate(
                    "() => (document.documentElement && document.documentElement.getAttribute('data-tsx-content-loaded')==='1')"
                )
            except Exception:
                ok = False
            # Если маркер не найден — продолжаем; расширение подхватится по манифесту
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            # Дождёмся сетевых запросов и дадим странице стабилизироваться
            try:
                page.wait_for_load_state('networkidle', timeout=5000)
            except Exception:
                pass
            try:
                post_open_ms = int(getattr(parse_args_for_runtime(), 'post_open_ms', 400))
            except Exception:
                post_open_ms = 400
            try:
                if post_open_ms > 0:
                    page.wait_for_timeout(post_open_ms)
            except Exception:
                pass
            if stop_event is not None and stop_event.is_set():
                try:
                    page.close()
                except Exception:
                    pass
                break
            try:
                page.bring_to_front()
            except Exception:
                pass

            # Дожидаемся (настраиваемое время), пока расширение отрисует блок (GO/3/3/2/3)
            # Независимый расчёт Формы(3) и логистики может занимать > 1 сек
            _dbg('stats', 'waiting for decision block')
            wait_for_decision_block(page, timeout_ms=DECISION_WAIT_MS)
            lp, rp = parse_players_from_stats_url(url)
            _dbg('stats', f'parsed URL params lp={lp} rp={rp}')
            fav, opp, _, reason = extract_favorite_and_opponents(page, lp=lp, rp=rp)
            _dbg('stats', f'extract fav/opp result fav={fav} opp={opp} reason={reason}')
            # Server-safe fallback: если расширение отключено и DOM не дал имена,
            # но в URL есть lp/rp — используем их, даже если не смогли распарсить со страницы
            if not (fav and opp):
                if lp and rp:
                    fav, opp = lp, rp
                elif lp and not opp:
                    fav, opp = lp, (opp or 'Оппонент')
                elif rp and not fav:
                    fav, opp = (fav or 'Фаворит'), rp
            # Если не нашли сразу — краткая повторная попытка
            if not (fav and opp and reason):
                try:
                    page.wait_for_timeout(min(2000, max(500, DECISION_WAIT_MS // 2)))
                except Exception:
                    pass
                fav2, opp2, _, reason = extract_favorite_and_opponents(page, lp=lp, rp=rp)
                if fav2 and opp2:
                    fav, opp = fav2, opp2
            if fav and opp and (reason or ALLOW_ALL or ALLOW_NOTIFY_ALL):
                # Извлечь метрики для новой строки CSV
                metrics = _extract_metrics_for_csv(page, fav, opp)
                _dbg('stats', f'metrics: {metrics}')
                save_match_row(url, fav, opp, metrics, output_csv)
                # Telegram notify if configured (new formatted message using compare block if available)
                try:
                    if _TG_SENDER:
                        compare = _extract_compare_block(page)
                        # Live score: prefer captured from live list by URL; fallback to stats page extraction
                        live_score = None
                        try:
                            live_score = _LIVE_SCORE_BY_URL.get(_canonical_stats_url(url)) or _LIVE_SCORE_BY_URL.get(url)
                        except Exception:
                            live_score = None
                        # do not fallback to stats page to avoid mixing with 'топ-счёт'
                        # Try to resolve orientation of live score relative to favourite using live names or lp/rp
                        try:
                            if url in _LIVE_NAMES_BY_URL:
                                names = _LIVE_NAMES_BY_URL.get(url) or []
                                if len(names) >= 2:
                                    def _n(s: str) -> str:
                                        return re.sub(r"\s+", " ", (s or '').lower()).strip()
                                    live_left = _n(names[0]); live_right = _n(names[1])
                                    fav_n = _n(fav); opp_n = _n(opp)
                                    # match by substring inclusion either way
                                    if fav_n and (fav_n in live_left or live_left in fav_n):
                                        _LIVE_FAV_IS_LEFT_BY_URL[_canonical_stats_url(url)] = True
                                    elif fav_n and (fav_n in live_right or live_right in fav_n):
                                        _LIVE_FAV_IS_LEFT_BY_URL[_canonical_stats_url(url)] = False
                            # fallback: use lp/rp from the URL map (panel)
                            if _LIVE_FAV_IS_LEFT_BY_URL.get(_canonical_stats_url(url)) is None:
                                try:
                                    lp, rp = _LIVE_LR_BY_URL.get(_canonical_stats_url(url), (None, None))
                                except Exception:
                                    lp, rp = (None, None)
                                if isinstance(lp, str) or isinstance(rp, str):
                                    fav_n = re.sub(r"\s+", " ", (fav or '').lower()).strip()
                                    if isinstance(lp, str) and fav_n and re.sub(r"\s+", " ", lp.lower()).strip() == fav_n:
                                        _LIVE_FAV_IS_LEFT_BY_URL[_canonical_stats_url(url)] = True
                                    elif isinstance(rp, str) and fav_n and re.sub(r"\s+", " ", rp.lower()).strip() == fav_n:
                                        _LIVE_FAV_IS_LEFT_BY_URL[_canonical_stats_url(url)] = False
                        except Exception:
                            pass
                        # Detect finished state from live list (preferred)
                        finished = bool(_LIVE_FINISHED_BY_URL.get(_canonical_stats_url(url)) or _LIVE_FINISHED_BY_URL.get(url))
                        # Определим полное название лиги для заголовка сообщения
                        league = None
                        try:
                            league = _extract_league_name(page)
                        except Exception:
                            league = None
                        # Fallback: use league captured on live list for this URL
                        if not league:
                            try:
                                league = _LEAGUE_BY_URL.get(url)
                            except Exception:
                                pass
                        # Всегда отправляем сообщение; строка счёта появится, когда live-счёт станет доступен
                            score_line = _compose_score_with_sets(_canonical_stats_url(url), live_score)
                        msg = _format_tg_message_new(fav, opp, url, compare, metrics, score_line, league=league)
                        # Optional filter: skip PASS verdicts
                        if not (HIDE_PASS and (' | 🔴 PASS |' in msg or msg.strip().endswith('🔴 PASS | Ставка: —'))):
                            _upsert_tg_message(url, msg, finished)
                except Exception:
                    pass
                processed.add(url)  # помечаем как обработанный только при успешном сохранении
                print(f"[saved] {fav} vs {opp} ({url})")
                saved += 1
            else:
                print(f"[skip] Нет условий (GO/3/3/2/3) или не найден фав/опп: {url}")
                if os.getenv("AUTOBET_DEBUG"):
                    try:
                        blk = page.locator('.take-two-sets').first
                        txt = blk.inner_text(timeout=500) if blk.count() > 0 and blk.is_visible(timeout=200) else page.locator('body').inner_text(timeout=500)
                        snippet = re.sub(r"\s+", " ", txt)[:200]
                        print(f"[debug] snippet: {snippet}")
                    except Exception:
                        pass
        except Exception as e:
            print(f"[error] {url}: {e}")
        finally:
            try:
                if not globals().get('DRIVE_UI'):
                    page.close()
                else:
                    try:
                        page.goto(URL, wait_until="domcontentloaded", timeout=15000)
                    except Exception:
                        pass
            except Exception:
                pass
            # Не помечаем как processed, если не было сохранения —
            # чтобы в последующих пересканах можно было переоценить матч
            visited += 1
    save_processed_urls(processed, processed_path)
    print(f"Итог: собрано ссылок={len(links)}, открыто={visited}, сохранено={saved}, пропущено как processed={skipped_processed}")


def parse_players_from_stats_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        q = parse_qs(urlparse(url).query)
        lp = (q.get("lp") or [None])[0]
        rp = (q.get("rp") or [None])[0]
        return lp, rp
    except Exception:
        return None, None


def _canonical_stats_url(url: str) -> str:
    """Ensure /stats URL has URL-encoded lp/rp parameters so links are clickable.
    Safely re-encodes only lp/rp values, avoiding double-encoding.
    """
    try:
        u = urlparse(url)
        if "/stats" not in (u.path or ""):
            return url
        pairs = parse_qsl(u.query, keep_blank_values=True)
        out = []
        for k, v in pairs:
            if k in ("lp", "rp") and isinstance(v, str):
                v = quote(unquote(v), safe="")
            out.append((k, v))
        new_q = "&".join(f"{k}={v}" for k, v in out)
        return urlunparse((u.scheme, u.netloc, u.path, u.params, new_q, u.fragment))
    except Exception:
        return url

def _norm_name(s: Optional[str]) -> str:
    if not isinstance(s, str):
        return ""
    t = re.sub(r"\s+", " ", s).strip().lower()
    try:
        return t
    except Exception:
        return t


def _extract_metrics_for_csv(page, fav: str, opp: str) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Parse page text to extract:
    - noBT3_noH2H (favorite)
    - noBT3_H2H (favorite)
    - logistic3_fav
    - indexP3_fav
    Returns tuple of floats (percent values) or None if unavailable.
    """
    # 1a) Try reading directly from the injected min2-extract dataset
    try:
        v = page.evaluate(
            "() => {\n"
            "  const el = document.querySelector('.min2-extract');\n"
            "  if (!el) return null;\n"
            "  return { fav: el.dataset.fav||'', log3: el.dataset.log3||'', idx3: el.dataset.idx3||'' };\n"
            "}"
        )
        if isinstance(v, dict):
            def _f(x):
                try:
                    return float(str(x).replace(',', '.')) if str(x) else None
                except Exception:
                    return None
            log3 = _f(v.get('log3'))
            idx3 = _f(v.get('idx3'))
            # NB values не выводятся в блоке — оставляем None
            if log3 is not None or idx3 is not None:
                return (None, None, log3, idx3)
    except Exception:
        pass

    # 1b) Try structured extraction via content script if available
    try:
        data = page.evaluate("() => (typeof window.__tennisScoreExtract==='function' ? window.__tennisScoreExtract() : null)")
    except Exception:
        data = None

    if isinstance(data, dict):
        try:
            nameA = (data.get('playerA') or {}).get('name')
            nameB = (data.get('playerB') or {}).get('name')
            i_fav = 0 if _norm_name(nameA) == _norm_name(fav) else (1 if _norm_name(nameB) == _norm_name(fav) else None)
            # If names mismatch (e.g., diacritics), fallback: decide favorite by larger nonBT p10
            if i_fav is None:
                p10A = (data.get('playerA') or {}).get('nonBTProbability10')
                p10B = (data.get('playerB') or {}).get('nonBTProbability10')
                if isinstance(p10A, (int, float)) and isinstance(p10B, (int, float)):
                    i_fav = 0 if p10A >= p10B else 1
            # Extract metrics
            if i_fav is not None:
                A = data.get('playerA') or {}
                B = data.get('playerB') or {}
                favSide = A if i_fav == 0 else B
                # Non-BT 3 no H2H / with H2H
                nb_noh2h_3 = favSide.get('nonBTProbability3')
                nb_h2h_3 = favSide.get('nonBTProbability3_h2h')
                # Logistic p3 per playerA/B (percent)
                logi = data.get('logistic') or {}
                pA3 = logi.get('pA3'); pB3 = logi.get('pB3')
                if isinstance(pA3, (int, float)) and isinstance(pB3, (int, float)):
                    log3 = pA3 if i_fav == 0 else pB3
                else:
                    log3 = None
                # Index P3 fav — используем p3 из блока индекса (совпадает с nonBTProbability3)
                idx_p3 = favSide.get('nonBTProbability3')
                def as_float(x):
                    return float(x) if isinstance(x, (int, float)) else None
                return (
                    as_float(nb_noh2h_3),
                    as_float(nb_h2h_3),
                    as_float(log3),
                    as_float(idx_p3),
                )
        except Exception:
            pass

    # 2) Fallback: parse from page text
    try:
        body = page.locator('body').inner_text(timeout=2000)
    except Exception:
        body = ""
    text = re.sub(r"\s+", " ", body)

    def to_num(s):
        try:
            return float(str(s).replace(',', '.'))
        except Exception:
            return None

    # Non-BT (3) without and with H2H near favorite name section
    nb_noh2h_3 = None
    nb_h2h_3 = None
    try:
        # Search globally; choose the larger as favorite if anchors fail
        fav_anchor = re.escape(fav)
        m_anchor = re.search(fav_anchor, text, re.IGNORECASE)
        # Flexible patterns allowing intermediate percents
        pat_noh2h = re.compile(r"без\s*H2H.*?3\s*:\s*([\d.,]+)%", re.IGNORECASE)
        pat_h2h   = re.compile(r"с\s*H2H.*?3\s*:\s*([\d.,]+)%", re.IGNORECASE)
        if m_anchor:
            # Take a local window around anchor but allow large span
            start = max(0, m_anchor.start() - 400)
            end = min(len(text), m_anchor.end() + 1200)
            ctx = text[start:end]
            m1 = pat_noh2h.search(ctx)
            if m1:
                nb_noh2h_3 = to_num(m1.group(1))
            m2 = pat_h2h.search(ctx)
            if m2:
                nb_h2h_3 = to_num(m2.group(1))
        # If still None, take the maximum pair from the whole page (favoring favorite)
        if nb_noh2h_3 is None:
            all_noh2h = [to_num(x) for x in pat_noh2h.findall(text)]
            if all_noh2h:
                nb_noh2h_3 = max(v for v in all_noh2h if v is not None)
        if nb_h2h_3 is None:
            all_h2h = [to_num(x) for x in pat_h2h.findall(text)]
            if all_h2h:
                nb_h2h_3 = max(v for v in all_h2h if v is not None)
    except Exception:
        pass

    # Logistic model (3): pick the higher of two numbers (fav-oriented)
    log3 = None
    try:
        m = re.search(r"Прогноз\s*\(логистическая модель\).*?Вероятность\s*\(3\)\s*([\d.,]+)%\s*([\d.,]+)%", text, re.IGNORECASE)
        if m:
            a = to_num(m.group(1)); b = to_num(m.group(2))
            if a is not None and b is not None:
                log3 = max(a, b)
    except Exception:
        pass

    # Strength index/form (10): Probability (3) — take higher as favorite
    idx_p3 = None
    try:
        m = re.search(r"Индекс силы и форма\s*\(10 игр\).*?Вероятность\s*\(3\)\s*([\d.,]+)%\s*([\d.,]+)%", text, re.IGNORECASE)
        if m:
            a = to_num(m.group(1)); b = to_num(m.group(2))
            if a is not None and b is not None:
                idx_p3 = max(a, b)
    except Exception:
        pass

    return nb_noh2h_3, nb_h2h_3, log3, idx_p3


def _extract_current_score(page) -> Optional[str]:
    """Best-effort extraction of current match score from the stats page.
    Returns a short string like "2:1" or None if not found.
    """
    # 1) Try to read obvious scoreboard-like nodes
    try:
        sel_candidates = [
            "[class*='score']", "[class*='Score']", "[class*='scoreboard']",
            "[data-test*='score']", "[data-testid*='score']",
            "table.score, .match-score, .current-score",
        ]
        for sel in sel_candidates:
            loc = page.locator(sel)
            n = min(loc.count(), 6)
            for i in range(n):
                try:
                    t = loc.nth(i).inner_text().strip()
                except Exception:
                    continue
                if not t:
                    continue
                text = re.sub(r"\s+", " ", t)
                # Prefer set-like small digits first
                m = re.search(r"\b([0-5])\s*[:\-–—]\s*([0-5])\b", text)
                if not m:
                    m = re.search(r"\b(\d{1,2})\s*[:\-–—]\s*(\d{1,2})\b", text)
                if m:
                    return f"{m.group(1)}:{m.group(2)}"
    except Exception:
        pass

    # 2) Fallback: scan body text (avoid 'Топ‑счёт' and predictions)
    try:
        body = page.locator('body').inner_text(timeout=1500)
    except Exception:
        body = ""
    if body:
        text = re.sub(r"\s+", " ", body)
        # Avoid matching times like 00:49; avoid 'топ-счёт' and predictions
        m = None
        for pat in (
            r"(?:по\s*сетам|сеты|sets)[^\d]{0,20}(\d{1,2})\s*[:\-–—]\s*(\d{1,2})",
            r"\b([0-5])\s*[:\-–—]\s*([0-5])\b",
        ):
            mm = re.search(pat, text, re.IGNORECASE)
            if mm:
                # Make sure the substring is not part of 'топ-счёт'
                span_text = text[max(0, mm.start()-12):mm.start()].lower()
                if 'топ' in span_text or 'top' in span_text:
                    continue
                m = mm
                break
        if not m:
            mm = re.search(r"\b(\d{1,2})\s*[:\-–—]\s*(\d{1,2})\b", text)
            if mm:
                span_text = text[max(0, mm.start()-12):mm.start()].lower()
                if 'топ' not in span_text and 'top' not in span_text:
                    m = mm
        if m:
            return f"{m.group(1)}:{m.group(2)}"
    return None


def _extract_compare_block(page) -> Optional[dict]:
    """Extracts values from new compare block (.min2-compare) rendered by the extension.
    Returns a dict or None if the block is not found.
    Dict shape:
      {
        'favName': str, 'oppName': str,
        'nb3': {'fav': {'noH2H': float|None, 'h2h': float|None}, 'opp': {...}},
        'ml3': {'fav': float|None, 'opp': float|None},
        'idx3': {'fav': float|None, 'opp': float|None},
        'd35': {'fav': str|None, 'opp': str|None},
        'last10': {'favDots': str|None, 'favW': int|None, 'favL': int|None},
      }
    """
    try:
        data = page.evaluate(
            """
            () => {
              const root = document.querySelector('.min2-compare');
              if (!root) return null;
              const pickNum = (s) => {
                if (!s) return null;
                const m = (s.match(/[\d.,]+/) || [])[0];
                if (!m) return null;
                const v = parseFloat(m.replace(',', '.'));
                return Number.isFinite(v) ? v : null;
              };
              const text = (sel) => {
                const el = root.querySelector(sel);
                return el ? (el.innerText || el.textContent || '').trim() : '';
              };
              const favName = text('.cmp-head > div:nth-child(1)');
              const oppName = text('.cmp-head > div:nth-child(2)');
              const normName = (s) => (s||'')
                .replace(/[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u2600-\u27BF\u1F000-\u1FAFF]/g,' ')
                .replace(/^[^\p{L}\p{N}]+/gu,'')
                .replace(/[^\p{L}\p{N}\s]+/gu,' ')
                .replace(/\s+/g,' ').trim().toLowerCase();
              const nbFav = text('.cmp-row.nb3 .fav.nb3');
              const nbOpp = text('.cmp-row.nb3 .opp.nb3');
              const nbFav_no = pickNum((nbFav.match(/без\s*H2H\s*([^•]+)/i)||[])[1]||'');
              const nbFav_h2 = pickNum((nbFav.match(/с\s*H2H\s*([^•]+)/i)||[])[1]||'');
              const nbOpp_no = pickNum((nbOpp.match(/без\s*H2H\s*([^•]+)/i)||[])[1]||'');
              const nbOpp_h2 = pickNum((nbOpp.match(/с\s*H2H\s*([^•]+)/i)||[])[1]||'');
              const mlFav = pickNum(text('.cmp-row.ml3 .fav.ml3'));
              const mlOpp = pickNum(text('.cmp-row.ml3 .opp.ml3'));
              const idxFav = pickNum(text('.cmp-row.idx3 .fav.idx3'));
              const idxOpp = pickNum(text('.cmp-row.idx3 .opp.idx3'));
              const dFav = text('.cmp-row.d35 .fav.d35 .nb-win');
              const dOpp = text('.cmp-row.d35 .opp.d35 .nb-win');
              // last10 for fav and opp: map dots to emojis and count
              const readDots = (el) => {
                if (!el) return { dots: null, w: null, l: null };
                const ds = Array.from(el.querySelectorAll('.dot'));
                const parts = [];
                let w = 0, l = 0;
                for (const d of ds) {
                  if (d.classList.contains('dot-win')) { parts.push('🟢'); w++; }
                  else if (d.classList.contains('dot-loss')) { parts.push('🔴'); l++; }
                }
                return { dots: parts.join(''), w, l };
              };
              // Try strict selectors first
              let favLastEl = root.querySelector('.cmp-row.last10 .fav.last10');
              let oppLastEl = root.querySelector('.cmp-row.last10 .opp.last10');
              // Fallbacks: tolerate markup variants
              if (!favLastEl) favLastEl = root.querySelector('.last10 .fav, .fav.last10');
              if (!oppLastEl) oppLastEl = root.querySelector('.last10 .opp, .opp.last10');
              const rFav = readDots(favLastEl);
              const rOpp = readDots(oppLastEl);
              // Additional fallback: visualization row tokens per player
              // Visualization row (.viz): read by inspecting .dot-win/.dot-loss spans
              const vizFavDots = (function(){
                const el = root.querySelector('.cmp-row.viz .fav.viz');
                const r = readDots(el);
                return r.dots || '';
              })();
              const vizOppDots = (function(){
                const el = root.querySelector('.cmp-row.viz .opp.viz');
                const r = readDots(el);
                return r.dots || '';
              })();
              // Per user request: use last10 row as H2H series relative to favorite
              let h2hFav = rFav;
              let h2hOpp = rOpp && rOpp.dots ? rOpp : (function(){
                const inv = (rFav.dots || '').split('').map(ch => ch === '🟢' ? '🔴' : (ch === '🔴' ? '🟢' : ch)).join('');
                return { dots: inv, w: null, l: null };
              })();
              // If dedicated last10 block renders combined H2H tokens as text, extract them
              try {
                const last10Row = root.querySelector('.cmp-row.last10');
                if (last10Row) {
                  const tx = (last10Row.innerText || last10Row.textContent || '').trim();
                  const tok = (tx.match(/[🟢🔴]/g) || []).join('');
                  if (tok) { h2hFav = { dots: tok, w: null, l: null }; }
                }
              } catch(_){ }
              // Try to derive H2H score: prefer DOM total like <div class="total">5 : 5</div>
              let h2hScore = null;
              try {
                const tot = root.querySelector('.total');
                if (tot) {
                  const t = (tot.innerText || tot.textContent || '').trim();
                  const m = t.match(/(\d{1,2})\s*[:\-–—]\s*(\d{1,2})/);
                  if (m) h2hScore = `${m[1]}:${m[2]}`; // left:right == fav:opp
                }
              } catch(_){ }
              try {
                if (!h2hScore) {
                  const d = (typeof window.__tennisScoreExtract==='function') ? window.__tennisScoreExtract() : null;
                  if (d && d.h2h && d.h2h.summary) {
                  // Support multiple summary shapes
                  let a = null, b = null;
                  if (typeof d.h2h.summary.A === 'object') {
                    a = Number(d.h2h.summary.A?.wins||0);
                    b = Number(d.h2h.summary.B?.wins||0);
                  }
                  if ((a===null||b===null) && ("playerAWins" in d.h2h.summary || "playerBWins" in d.h2h.summary)) {
                    a = Number(d.h2h.summary.playerAWins||0);
                    b = Number(d.h2h.summary.playerBWins||0);
                  }
                  if (a===null || b===null) {
                    a = Number(d.h2h.summary.AWins||0);
                    b = Number(d.h2h.summary.BWins||0);
                  }
                  // Orient to fav name
                  const nameA = (d.playerA && d.playerA.name) || '';
                  const nameB = (d.playerB && d.playerB.name) || '';
                  const favNorm = normName(favName||'');
                  const aNorm = normName(nameA||'');
                  const bNorm = normName(nameB||'');
                  if (favNorm && (favNorm === aNorm)) h2hScore = `${a}:${b}`;
                  else if (favNorm && (favNorm === bNorm)) h2hScore = `${b}:${a}`;
                  else h2hScore = `${a}:${b}`; // default A:B
                  }
                }
              } catch(_){ }
              // FCI percent from inline row (if present)
              let fciPct = null;
              try {
                const fciEl = root.querySelector('.cmp-row.fci');
                if (fciEl) {
                  const t = (fciEl.innerText || fciEl.textContent || '').replace(/\s+/g,' ').trim();
                  const m = t.match(/FCI\s*:\s*([\d.,]+)/i);
                  if (m) {
                    const v = parseFloat(String(m[1]).replace(',', '.'));
                    if (!Number.isNaN(v)) fciPct = v;
                  }
                }
              } catch(_){ }
              // Committee calibrated percent (if present)
              let committeePct = null;
              try {
                const cEl = root.querySelector('.cmp-row.committee');
                if (cEl) {
                  const tt = (cEl.innerText || cEl.textContent || '').replace(/\s+/g,' ').trim();
                  const mc = tt.match(/комитет\s*\(калибр\.\)\s*:\s*([\d.,]+)/i);
                  if (mc) {
                    const vv = parseFloat(String(mc[1]).replace(',', '.'));
                    if (!Number.isNaN(vv)) committeePct = vv;
                  }
                }
              } catch(_){ }
              // Markov–BT row (probability and top score)
              let mbt = null;
              try {
                const mbtEl = root.querySelector('.cmp-row.mbt');
                if (mbtEl) {
                  const tt = (mbtEl.innerText || mbtEl.textContent || '').replace(/\s+/g,' ').trim();
                  const mp = tt.match(/марков[–-]bt\s*([\d.,]+)%/i);
                  const ms = tt.match(/Топ\s*[-–—]?\s*сч[её]т\s*:\s*([0-9:]+)/i);
                  const out = {};
                  if (mp) {
                    const pv = parseFloat(String(mp[1]).replace(',', '.'));
                    if (!Number.isNaN(pv)) out.pct = pv;
                  }
                  if (ms) out.bestScore = ms[1];
                  if (Object.keys(out).length) mbt = out;
                }
              } catch(_){ }
              return {
                favName, oppName,
                nb3: { fav: { noH2H: nbFav_no, h2h: nbFav_h2 }, opp: { noH2H: nbOpp_no, h2h: nbOpp_h2 } },
                ml3: { fav: mlFav, opp: mlOpp },
                idx3: { fav: idxFav, opp: idxOpp },
                d35: { fav: dFav || null, opp: dOpp || null },
                last10: { favDots: (rFav.dots||vizFavDots||null), favW: rFav.w, favL: rFav.l, oppDots: (rOpp.dots||vizOppDots||null), oppW: rOpp.w, oppL: rOpp.l },
                vizDots: { fav: vizFavDots, opp: vizOppDots },
                h2hDots: { fav: h2hFav.dots, opp: h2hOpp.dots },
                h2hScore,
                fciPct,
                committeePct,
                mbt,
              };
            }
            """
        )
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def _extract_league_name(page) -> Optional[str]:
    """Пытается извлечь полное название лиги/турнира со страницы статистики.
    Приоритет: явные DOM‑элементы → эвристики по тексту. Возвращает строку или None.
    """
    # 0) Попробуем прочитать из заметных DOM‑узлов (заголовки/подзаголовки)
    try:
        league_dom = page.evaluate(
            """
            () => {
              const pick = (el) => (el ? (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim() : '');
              const roots = [
                document.querySelector('h1'),
                document.querySelector('header h1'),
                document.querySelector('.table-top'),
                document.querySelector('.container-xl.mb-5 h1'),
                document.querySelector('.breadcrumbs'),
              ].filter(Boolean);
              const texts = [];
              for (const r of roots) {
                const t = pick(r); if (t) texts.push(t);
              }
              // Также попробуем title страницы
              const title = (document.title||'').trim();
              if (title) texts.push(title);
              // Ищем самое правдоподобное по ключевым словам
              const key = /(лига|турнир|cup|liga|league|pro|tt)/i;
              const candidates = texts
                .map(s => s.replace(/\s+/g,' ').trim())
                .filter(s => key.test(s) && s.length >= 3);
              // Вернём самую длинную осмысленную строку
              if (candidates.length) {
                candidates.sort((a,b)=>b.length - a.length);
                let top = candidates[0];
                // Срежем хвосты интерфейса (например, «Статистика», «Игроки»)
                top = top.replace(/\s*(Статистика|Игроки)\b.*$/i,'').trim();
                return top || candidates[0];
              }
              return null;
            }
            """,
        )
        if isinstance(league_dom, str) and 2 <= len(league_dom) <= 120:
            return league_dom
    except Exception:
        pass

    # 1) Если ранее собрали список лиг, попробуем найти любое из названий прямо в DOM/тексте
    try:
        if _KNOWN_LEAGUES:
            txt_dom = page.evaluate("() => (document.body ? (document.body.innerText||document.body.textContent||'') : '')") or ''
            hay = re.sub(r"\s+", " ", txt_dom).strip()
            if hay:
                # Ищем точные вхождения, длинные названия — приоритетнее
                for name in sorted(_KNOWN_LEAGUES, key=len, reverse=True):
                    if name and name in hay:
                        return name
    except Exception:
        pass

    # 2) Текст страницы (fallback)
    try:
        body = page.locator('body').inner_text(timeout=1500)
    except Exception:
        body = ""
    text = re.sub(r"\s+", " ", body or "").strip()
    if not text:
        return None

    for pat in (
        r"(?:Турнир|Лига)\s*[:\-–—]\s*([^\n\r]+)",
        r"Турнир\s*\.?\s*([^\n\r]+)",
    ):
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            val = (m.group(1) or '').strip()
            val = re.split(r"\s{2,}|\sСтатистика\b|\sИгроки\b", val)[0].strip()
            if 2 <= len(val) <= 120:
                return val

    prefixes = ["Лига Про", "Кубок ТТ", "Сетка Кап", "TT Cup", "Win Cup", "Liga Pro"]
    # расширим известными полными названиями, если есть
    try:
        for x in _KNOWN_LEAGUES:
            if isinstance(x, str) and x:
                prefixes.append(x)
    except Exception:
        pass
    best = None
    best_len = 0
    for pfx in prefixes:
        m = re.search(rf"\b{re.escape(pfx)}[^\n\r]*", text, flags=re.IGNORECASE)
        if m:
            cand = m.group(0).strip()
            cand = re.split(r"\sСтатистика\b|\sИгроки\b|https?://", cand)[0].strip()
            if best is None or len(cand) > best_len:
                best, best_len = cand, len(cand)
    if best_len:
        return best

    return None


def _format_tg_message_new(
    fav: str,
    opp: str,
    url: str,
    compare: Optional[dict],
    fallback_metrics: Tuple[Optional[float], Optional[float], Optional[float], Optional[float]],
    h2h_score: Optional[str] = None,
    league: Optional[str] = None,
) -> str:
    """Build a compact Telegram message. Uses compare-block data when present,
    otherwise falls back to a short 4-line summary."""
    ts = datetime.now().strftime('%H:%M')
    # repurpose optional param as live score line
    live_score = h2h_score if isinstance(h2h_score, str) and h2h_score.strip() else None

    if isinstance(compare, dict):
        # New layout: mirror key rows from .min2-compare for Telegram
        try:
            def esc(s: str) -> str:
                return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if isinstance(s, str) else s)
            def fmt0(v):
                try:
                    return f"{float(v):.0f}%"
                except Exception:
                    return '—'
            def nb_line(no, h2h):
                left = f"без H2H {fmt0(no)}" if isinstance(no, (int, float)) else None
                right = f"с H2H {fmt0(h2h)}" if isinstance(h2h, (int, float)) else None
                return ' • '.join([p for p in (left, right) if p]) or '—'
            def norm_delta(text_s: str) -> str:
                t = (text_s or '').replace('\xa0', ' ').replace('&nbsp;', ' ')
                pos = ('+' in t) or ('↑' in t)
                neg = ('−' in t or '-' in t) or ('↓' in t)
                m = re.search(r"([+−\-]?\s*\d+[\.,]?\d*)\s*%", t)
                num = m.group(1).replace(' ', '') if m else None
                if pos and not neg:
                    return f"{num}% ↑" if num else "↑"
                if neg and not pos:
                    if num and not num.startswith('−') and num.startswith('-'):
                        num = '−' + num[1:]
                    return f"{num}% ↓" if num else "↓"
                return (num + '% ↔') if num else '↔'

            ts_line = f"⏱ {datetime.now().strftime('%H:%M')}" + (f" {esc(league)}" if league else "")
            header2 = f"🏆 {esc(fav)} VS  🚩{esc(opp)}"

            # NB (без BT), ML(3), IDX(3), Δ(3−5)
            nb = compare.get('nb3') or {}
            nb_f = nb_line((nb.get('fav') or {}).get('noH2H'), (nb.get('fav') or {}).get('h2h'))
            nb_o = nb_line((nb.get('opp') or {}).get('noH2H'), (nb.get('opp') or {}).get('h2h'))
            ml = compare.get('ml3') or {}
            idx = compare.get('idx3') or {}
            d35 = compare.get('d35') or {}
            ml_f, ml_o = ml.get('fav'), ml.get('opp')
            idx_f, idx_o = idx.get('fav'), idx.get('opp')
            d_f, d_o = d35.get('fav') or '', d35.get('opp') or ''

            # Visualization dots (explicitly use .viz rows per request)
            vd = compare.get('vizDots') or {}
            fav_dots = (vd.get('fav') or '').strip()
            opp_dots = (vd.get('opp') or '').strip()
            # Fallback to last10 only if viz is missing
            if (not fav_dots) or (not opp_dots):
                last10 = compare.get('last10') or {}
                fav_dots = fav_dots or (last10.get('favDots') or '').strip()
                opp_dots = opp_dots or (last10.get('oppDots') or '').strip()
            h2h = (compare.get('h2hDots') or {})
            h2h_line = (h2h.get('fav') or '').strip()
            # Fallback: if H2H not extracted, reuse fav viz series
            if not h2h_line:
                h2h_line = fav_dots

            # MBT + FCI + Committee
            mbt = compare.get('mbt') or {}
            top_score = mbt.get('bestScore') or '—'
            mbt_pct = mbt.get('pct')
            if isinstance(mbt_pct, (int, float)):
                mbt_line = f"Марков–BT {int(round(float(mbt_pct)))}% топ-счёт: {esc(top_score)}"
            else:
                mbt_line = "Марков–BT — топ-счёт: —"
            fci = compare.get('fciPct')
            if isinstance(fci, (int, float)):
                fci_line = f"FCI: {float(fci):.1f}%"
            else:
                fci_line = "FCI: —"
            comm = compare.get('committeePct')
            if isinstance(comm, (int, float)):
                sum_line = f"SUM: {int(round(float(comm)))}%"
            else:
                sum_line = "SUM: —"

            link = esc(_canonical_stats_url(url))

            # ===== Final Verdict Line (unified score with flags) =====
            def _to_num(x):
                try:
                    v = float(x)
                    if v != v:  # NaN
                        return None
                    return v
                except Exception:
                    return None

            def _parse_delta_num(s: str):
                try:
                    if not s:
                        return None
                    m = re.search(r"([+−\-]?\s*\d+(?:[\.,]\d+)?)\s*%", str(s))
                    if not m:
                        return None
                    num = m.group(1).replace(' ', '').replace(',', '.')
                    # normalize unicode minus
                    num = num.replace('−', '-')
                    return float(num)
                except Exception:
                    return None

            def build_min2_indicator(cmp: dict) -> list[str]:
                try:
                    # Inputs
                    p_noH2H_3 = _to_num(((cmp.get('nb3') or {}).get('fav') or {}).get('noH2H'))
                    p_withH2H_3 = _to_num(((cmp.get('nb3') or {}).get('fav') or {}).get('h2h'))
                    logistic_3 = _to_num((cmp.get('ml3') or {}).get('fav'))
                    strength_10 = _to_num((cmp.get('idx3') or {}).get('fav'))
                    delta_3_5 = _parse_delta_num((cmp.get('d35') or {}).get('fav'))
                    # We don't extract 5–10 from the page yet — use 3–5 as proxy if missing
                    delta_5_10 = delta_3_5
                    fci = _to_num(cmp.get('fciPct'))
                    sum_pct = _to_num(cmp.get('committeePct'))
                    h2h_last10 = (cmp.get('last10') or {}).get('favDots') or ''
                    markov_top = ((cmp.get('mbt') or {}).get('bestScore')) or None

                    # Normalization
                    def clip01(x: float) -> float:
                        return max(0.0, min(1.0, x))

                    # Trend normalization per spec
                    ds = []
                    if isinstance(delta_5_10, (int, float)):
                        ds.append(delta_5_10)
                    if isinstance(delta_3_5, (int, float)):
                        ds.append(delta_3_5)
                    delta_min = min(ds) if ds else 0.0
                    delta_min = max(-25.0, min(25.0, delta_min))
                    delta_norm = (delta_min + 25.0) / 50.0

                    # Short signals
                    pNo = (p_noH2H_3 or 0.0) / 100.0
                    pH2 = (p_withH2H_3 or 0.0) / 100.0
                    pLog = (logistic_3 or 0.0) / 100.0
                    pStr = (strength_10 or 0.0) / 100.0
                    fciNorm = (fci or 0.0) / 100.0
                    sumNorm = (sum_pct or 0.0) / 100.0

                    # Sub-scores
                    trendScore = delta_norm
                    shortScore = 0.6 * pNo + 0.4 * pLog
                    h2hShortBoost = 0.5 * pH2 + 0.5 * pNo if isinstance(p_withH2H_3, (int, float)) else shortScore
                    shortWithH2H = 0.8 * shortScore + 0.2 * h2hShortBoost
                    contextScore = pStr
                    agreementScore = 0.7 * fciNorm + 0.3 * sumNorm
                    h2hWins = h2h_last10.count('🟢') if isinstance(h2h_last10, str) else 5
                    h2hScore = (h2hWins / 10.0) if h2hWins is not None else 0.5

                    # Markov adjustment
                    markovAdj = 0.0
                    if isinstance(markov_top, str):
                        if markov_top in {'3:0', '3:1'}:
                            markovAdj = 0.05
                        elif markov_top == '3:2':
                            markovAdj = 0.02
                        elif markov_top == '2:3':
                            markovAdj = -0.02
                        elif markov_top in {'1:3', '0:3'}:
                            markovAdj = -0.05

                    baseScore = (
                        0.30 * trendScore +
                        0.30 * shortWithH2H +
                        0.20 * agreementScore +
                        0.10 * contextScore +
                        0.10 * h2hScore
                    )
                    finalScore = clip01(baseScore + markovAdj)

                    # Verdict with stop flags
                    verdict = 'PASS'
                    tag = 'PASS'
                    # Stop flags
                    stop = False
                    if (fci is not None and fci < 55) or \
                       ((p_noH2H_3 is not None and p_noH2H_3 < 50) and (logistic_3 is not None and logistic_3 < 50)) or \
                       ((delta_3_5 is not None and delta_3_5 <= -10) and (delta_5_10 is not None and delta_5_10 <= -10)):
                        stop = True

                    if not stop:
                        if finalScore >= 0.70 and pNo >= 0.55 and pLog >= 0.50 and fciNorm >= 0.65:
                            verdict = '✅ GO — фаворит почти гарантированно возьмёт ≥ 2 сета'
                            tag = 'GO'
                        elif finalScore >= 0.60 and fciNorm >= 0.60:
                            verdict = '🟡 RISK — вероятно ≥ 2 сета, возможны 3:2 / 2:2'
                            tag = 'RISK'
                        else:
                            verdict = '🔴 PASS — риск ≤1 сета / 0:3 высокий'
                            tag = 'PASS'
                    else:
                        verdict = '🔴 PASS — стоп‑факторы'
                        tag = 'PASS'

                    # Build output lines
                    def pct0(x):
                        return '--' if x is None else f"{float(x):.0f}%"
                    def fmt_sign(x):
                        if x is None:
                            return '±0%'
                        return ('+' if x > 0 else ('−' if x < 0 else '±')) + f"{abs(float(x)):.0f}%"

                    line1 = f"🔎 Вердикт: {verdict.split(' — ')[0]} | Score {finalScore:.2f}"
                    # Per user request, output only the headline verdict line.
                    return [line1]
                except Exception:
                    return []

            def build_final_verdict_line(cmp: dict, fav_name: str, opp_name: str) -> str:
                try:
                    # Extract fields
                    p_no = _to_num(((cmp.get('nb3') or {}).get('fav') or {}).get('noH2H'))
                    p_log = _to_num((cmp.get('ml3') or {}).get('fav'))
                    p_str = _to_num((cmp.get('idx3') or {}).get('fav'))
                    p_h2h = _to_num(((cmp.get('nb3') or {}).get('fav') or {}).get('h2h'))
                    fci_v = _to_num(cmp.get('fciPct'))
                    sum_ag = _to_num(cmp.get('committeePct'))
                    top = (cmp.get('mbt') or {}).get('bestScore')
                    d35s_f = (cmp.get('d35') or {}).get('fav')
                    d35s_o = (cmp.get('d35') or {}).get('opp')
                    dnum_f = _parse_delta_num(d35s_f)
                    dnum_o = _parse_delta_num(d35s_o)

                    def clamp01(x: float) -> float:
                        return max(0.0, min(1.0, x))
                    def norm(x):
                        return clamp01((x or 0.0)/100.0)

                    pNo = norm(p_no)
                    pLog = norm(p_log)
                    pStr = norm(p_str)
                    pH2 = norm(p_h2h)
                    fciN = norm(fci_v)
                    sumN = norm(sum_ag) if sum_ag is not None else None
                    trendFav = dnum_f if (dnum_f is not None) else 0.0
                    trendOpp = dnum_o if (dnum_o is not None) else 0.0

                    # Base in percent space from four pillars 👤, 👥, 📊, 💪
                    # If some are missing, fall back to available ones with proportional weights
                    comps = []
                    weights = []
                    if p_no is not None: comps.append(p_no); weights.append(0.30)
                    if p_h2h is not None: comps.append(p_h2h); weights.append(0.20)
                    if p_log is not None: comps.append(p_log); weights.append(0.25)
                    if p_str is not None: comps.append(p_str); weights.append(0.25)
                    if not comps:
                        return ''
                    wsum = sum(weights) or 1.0
                    base_pct = sum(c*w for c, w in zip(comps, weights)) / wsum
                    score = clamp01(base_pct/100.0)

                    # --- Corrections per prompt ---
                    # 1) Extreme SUM
                    if sum_ag is not None and (sum_ag < 50 or sum_ag > 80):
                        score -= 0.04
                    # 2) Overheated favorite: high FCI, weak SUM
                    if (fci_v is not None and fci_v > 70) and (sum_ag is not None and sum_ag < 60):
                        score -= 0.06
                    # 3) False 3:0 signals
                    if isinstance(top, str) and top.strip() == '3:0' and score < 0.70:
                        score -= 0.05
                    # 4) Dissonance across pillars
                    pillars = [x for x in (p_no, p_h2h, p_log, p_str) if isinstance(x, (int, float))]
                    if pillars:
                        if (max(pillars) - min(pillars)) > 15:
                            score -= 0.04
                    # 6) Soft boost for stable winners
                    if (sum_ag is not None and 70 <= sum_ag <= 80) and (fci_v is not None and 55 <= fci_v <= 65) and (isinstance(top, str) and top in {'3:1','3:2'}):
                        score += 0.03
                    # 7) Consistency bonus (all four within ±5 pp)
                    if len(pillars) >= 3 and (max(pillars) - min(pillars)) <= 5:
                        score += 0.02

                    # --- Last-5 pattern rules ---
                    pattern_notes = []
                    def last5_from_dots(dots: str) -> str:
                        if not dots:
                            return ''
                        xs = [ch for ch in str(dots) if ch in ('🟢','🔴')]
                        return ''.join(xs[-5:])
                    fav_last5 = last5_from_dots(((cmp.get('last10') or {}).get('favDots') or ''))
                    opp_last5 = last5_from_dots(((cmp.get('last10') or {}).get('oppDots') or ''))

                    # 1) Green fall for favorite
                    if fav_last5 in ("🟢🟢🟢🔴🔴", "🟢🟢🔴🔴🔴"):
                        score -= 0.05
                        pattern_notes.append("зеленый спад (оверрейт)")
                    # 2) Long fall for favorite (four losses)
                    if "🔴🔴🔴🔴" in fav_last5:
                        score -= 0.06
                        pattern_notes.append("длинный спад (низкая форма)")
                    # 3) Underdog bounce
                    if opp_last5 in ("🔴🔴🟢🟢🟢", "🔴🟢🟢🟢🟢"):
                        score += 0.05
                        pattern_notes.append("отскок андердога (апсет-тренд)")
                    # 4) Chaos / alternating
                    if fav_last5 in ("🟢🔴🟢🔴🟢", "🔴🟢🔴🟢🔴"):
                        score -= 0.03
                        pattern_notes.append("нестабильная форма")

                    # Clamp to requested range 0.20–0.85
                    score = max(0.20, min(0.85, score))

                    # Underdog activation rule (proxy signals)
                    und_no = _to_num(((cmp.get('nb3') or {}).get('opp') or {}).get('noH2H'))
                    und_log = _to_num((cmp.get('ml3') or {}).get('opp'))
                    # Mirror condition per prompt: trend +10 for underdog and SUM > 70
                    sum_ok = (sum_ag is not None and sum_ag > 70)
                    underdog_has_signal = (
                        (und_no is not None and und_no >= 60) or
                        (und_log is not None and und_log >= 55) or
                        (trendOpp is not None and trendOpp >= 10 and sum_ok)
                    )

                    # Decide badge and stake per prompt
                    badge = '🔴 PASS'
                    flag = '—'
                    stake = '—'
                    out_score = score
                    # Пользователь не хочет выводить замечание «нестабильная форма»
                    pattern_notes = [n for n in pattern_notes if n != 'нестабильная форма']
                    pattern_note = "; ".join(pattern_notes) if pattern_notes else ''

                    if score >= 0.72:
                        badge = '✅ GO'; flag = '🏆'; stake = fav_name
                    elif score >= 0.60:
                        badge = '🟢 MID'; flag = '🏆'; stake = fav_name
                    elif 0.55 <= score < 0.60:
                        badge = '🟡 RISK'; flag = '🏆'; stake = fav_name
                    elif score < 0.45 and underdog_has_signal:
                        badge = '🟢 GO'; flag = '🚩'; stake = opp_name; out_score = score
                        if pattern_note:
                            pattern_note += "; апсет: недооценённый андердог"
                        else:
                            pattern_note = "апсет: недооценённый андердог"
                    else:
                        badge = '🔴 PASS'; flag = '—'; stake = '—'

                    # Build compact line without labels; keep label only for PASS stake
                    if stake == '—':
                        stake_part = 'Ставка: —'
                    else:
                        stake_part = f"{flag} {esc(stake)}"
                    # Persist stake side for this URL so that score marker (✅/🟡/❌) is relative to the stake, not always to favorite
                    try:
                        canon_url = _canonical_stats_url(url)
                        _STAKE_IS_FAV_BY_URL[canon_url] = (stake == fav_name)
                    except Exception:
                        pass
                    line = f"🎯 {out_score:.2f} | {badge} | {stake_part}"
                    # Пользователь просил не добавлять дополнительную строку с пояснением паттерна
                    return line
                except Exception:
                    return ''

            final_line = build_final_verdict_line(compare, fav, opp)

            # Top visual lines with dots per your style
            top_visual = []
            if fav_dots:
                top_visual.append('🏆 ' + fav_dots)
                top_visual.append('──────────────')
            if opp_dots:
                top_visual.append('🚩 ' + opp_dots)

            # Build compact box with two columns (fav | opp) using monospace
            def fmt_pct(v):
                try:
                    return f"{float(v):.0f}%"
                except Exception:
                    return '—'
            def pad_left(s: str, w: int = 10) -> str:
                s = s or ''
                return s.rjust(w)
            def pad_right(s: str, w: int = 10) -> str:
                s = s or ''
                return s.ljust(w)
            # Prepare values for rows
            delta_l = norm_delta(d_f)
            delta_r = norm_delta(d_o)
            nb_no_l = fmt_pct((nb.get('fav') or {}).get('noH2H'))
            nb_no_r = fmt_pct((nb.get('opp') or {}).get('noH2H'))
            nb_h2h_l = fmt_pct((nb.get('fav') or {}).get('h2h'))
            nb_h2h_r = fmt_pct((nb.get('opp') or {}).get('h2h'))
            ml_l = fmt_pct(ml_f)
            ml_r = fmt_pct(ml_o)
            idx_l = fmt_pct(idx_f)
            idx_r = fmt_pct(idx_o)
            box_lines = [
                f"📈 {pad_left(delta_l)} | {pad_right(delta_r)}",
                f"👤 {pad_left(nb_no_l)} | {pad_right(nb_no_r)}",
                f"👥 {pad_left(nb_h2h_l)} | {pad_right(nb_h2h_r)}",
                f"📊 {pad_left(ml_l)} | {pad_right(ml_r)}",
                f"💪 {pad_left(idx_l)} | {pad_right(idx_r)}",
            ]

            parts = [
                esc(ts_line),
                esc(header2),
                '',
                *[esc(x) for x in top_visual],
                '',
                "<pre>" + esc("\n".join(box_lines)) + "</pre>",
                ('⚔️ ' + esc(h2h_line)) if h2h_line else '',
                esc(mbt_line) if mbt_line else '',
                esc(sum_line) if sum_line else '',
                esc(fci_line) if fci_line else '',
                f"<a href=\"{link}\">Статистика</a>",
                final_line if final_line else '',
                (f"📟 Счёт: {esc(live_score)}" if live_score else ''),
            ]
            return "\n".join([s for s in parts if s])
        except Exception:
            pass

        # Old table formatting kept as fallback if above failed
        # HTML-escape helper
        def esc(s: str) -> str:
            return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if isinstance(s, str) else s)
        d35 = compare.get('d35', {})
        d_f = d35.get('fav') or '—'
        d_o = d35.get('opp') or '—'
        # Pull model values
        ml = compare.get('ml3') or {}
        idx = compare.get('idx3') or {}
        ml_f = ml.get('fav'); ml_o = ml.get('opp')
        idx_f = idx.get('fav'); idx_o = idx.get('opp')
        # H2H dots (optional)
        h2h = compare.get('h2hDots') or {}
        h2h_f = h2h.get('fav') or ''
        h2h_o = h2h.get('opp') or ''

        # Header lines (включаем полное название лиги, если удалось определить)
        if league:
            header = f"{esc('⏱ ' + ts)} {esc(league)}\n{esc('🏆 ' + fav + ' VS  🚩' + opp)}"
        else:
            header = f"{esc('⏱ ' + ts)}\n{esc('🏆 ' + fav + ' VS  🚩' + opp)}"

        # Column helpers (monospace block with centered columns and '|' between)
        def fmt_pct0(v):
            try:
                return f"{float(v):.0f}%"
            except Exception:
                return '—'
        def ellip(s: str, w: int) -> str:
            s = s or ''
            return s if len(s) <= w else (s[:max(0, w-1)] + '…')
        def center(s: str, w: int) -> str:
            s = ellip(s, w)
            pad = max(0, w - len(s))
            left = pad // 2
            right = pad - left
            return (' ' * left) + s + (' ' * right)
        def short_dots(s: str, n: int = 8) -> str:
            s = s or ''
            return s[-n:] if len(s) > n else s
        def colorize_delta(s: str) -> str:
            t = s or ''
            t = t.replace('&nbsp;', ' ')
            pos = ('+' in t) or ('↑' in t)
            neg = ('−' in t or '-' in t) or ('↓' in t)
            m = re.search(r"([+−\-]?\s*\d+[\.,]?\d*)\s*%", t)
            num = m.group(1).replace(' ', '') if m else None
            if pos and not neg:
                return f"{num}% 🟢↑" if num else "🟢↑"
            if neg and not pos:
                # Replace minus sign with unicode minus for consistency
                if num and not num.startswith('−') and num.startswith('-'):
                    num = '−' + num[1:]
                return f"{num}% 🔴↓" if num else "🔴↓"
            return num + '% ↔️' if num else '↔️'

        # Data values normalized
        fav_name = esc(compare.get('favName') or fav)
        opp_name = esc(compare.get('oppName') or opp)
        delta_f = colorize_delta(esc(d_f))
        delta_o = colorize_delta(esc(d_o))
        ml_f_s  = fmt_pct0(ml_f)
        ml_o_s  = fmt_pct0(ml_o)
        idx_f_s = fmt_pct0(idx_f)
        idx_o_s = fmt_pct0(idx_o)
        h2h_f_s = short_dots(h2h_f, 8)
        h2h_o_s = short_dots(h2h_o, 8)

        # Build compact centered table
        W = 14
        lines = []
        lines.append(center(fav_name, W) + ' | ' + center(opp_name, W))
        lines.append(center('─'*min(W, 10), W) + ' | ' + center('─'*min(W, 10), W))
        lines.append(center(delta_f, W) + ' | ' + center(delta_o, W))
        lines.append(center(ml_f_s, W) + ' | ' + center(ml_o_s, W))
        lines.append(center(idx_f_s, W) + ' | ' + center(idx_o_s, W))
        if h2h_f_s or h2h_o_s:
            lines.append(center(h2h_f_s, W) + ' | ' + center(h2h_o_s, W))
        block = "\n".join(lines)

        link = esc(_canonical_stats_url(url))
        parts = [header]
        parts.append(f"<pre>{block}</pre>")
        # H2H dots and H2H score before the stats link
        if h2h_f_s or h2h_o_s:
            parts.append(f"⚔️ {h2h_f_s} | {h2h_o_s}")
        parts.append(f"<a href=\"{link}\">Статистика</a>")
        # Score line strictly after verdict; recompute to ensure stake‑relative marker (✅/🟡/❌)
        if final_line:
            parts.append(final_line)
        if live_score:
            try:
                canon_url = _canonical_stats_url(url)
                sline = _compose_score_with_sets(canon_url, live_score)
                parts.append(f"📟 Счёт: {esc(sline)}")
            except Exception:
                parts.append(f"📟 Счёт: {esc(live_score)}")
        return "\n".join([p for p in parts if p])

    # Fallback to old format
    no_bt_3, with_h2h_3, log3, idx3 = fallback_metrics
    # Красивый fallback без расширения: нормальный заголовок, мини‑таблица, ссылка и счёт
    try:
        def esc(s: str) -> str:
            return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if isinstance(s, str) else s)
        hdr = f"⏱ {ts}" + (f" {esc(league)}" if league else "")
        title = f"🏆 {esc(fav)} VS  🚩{esc(opp)}"
        # Мини‑таблица, если есть хоть какие‑то числа
        def fmt0(v):
            try:
                return f"{float(v):.0f}%"
            except Exception:
                return '—'
        rows = []
        if any(isinstance(x, (int, float)) for x in (no_bt_3, with_h2h_3, log3, idx3)):
            rows.append(f"👤 {fmt0(no_bt_3)} | {fmt0(with_h2h_3)}")
            rows.append(f"📊 {fmt0(log3)} | {fmt0(idx3)}")
        block = ("<pre>" + esc("\n".join(rows)) + "</pre>") if rows else ''
        link = esc(_canonical_stats_url(url))
        # Мини‑вердикт‑заглушка: ставка по умолчанию на фаворита (для стабильной разметки)
        final_line = f"🎯 {'—'} | {'—'} | 🏆 {esc(fav)}"
        parts = [
            esc(hdr),
            esc(title),
            block,
            f"<a href=\"{link}\">Статистика</a>",
            final_line,
        ]
        # Если передан live_score (в параметре h2h_score), вставим его сразу
        if h2h_score:
            try:
                sline = _compose_score_with_sets(_canonical_stats_url(url), h2h_score)
                parts.append(esc(f"📟 Счёт: {sline}"))
            except Exception:
                parts.append(esc(f"📟 Счёт: {h2h_score}"))
        return "\n".join([p for p in parts if p])
    except Exception:
        # Совсем минимальная страховка
        link = _canonical_stats_url(url)
        return "\n".join([ts, f"{fav} VS {opp}", link])


def save_match_row(url: str, favorite: str, opponent: str, metrics: Tuple[Optional[float], Optional[float], Optional[float], Optional[float]], output_csv: str, **_ignored) -> None:
    exists = os.path.exists(output_csv)
    with open(output_csv, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if not exists:
            w.writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav", "url"])  # заголовки
        hhmmss = datetime.now().strftime("%H:%M:%S")
        no_bt_3, with_h2h_3, log3, idx3 = metrics
        w.writerow([
            hhmmss,
            favorite,
            opponent,
            (f"{no_bt_3:.1f}" if isinstance(no_bt_3, (int, float)) else ""),
            (f"{with_h2h_3:.1f}" if isinstance(with_h2h_3, (int, float)) else ""),
            (f"{log3:.0f}" if isinstance(log3, (int, float)) else ""),
            (f"{idx3:.0f}" if isinstance(idx3, (int, float)) else ""),
            _canonical_stats_url(url),
        ])
    # Дублируем запись в файл обратной совместимости, если сохраняем live-матчи
    if output_csv == OUTPUT_LIVE_CSV and OUTPUT_LIVE_CSV_COMPAT:
        compat_exists = os.path.exists(OUTPUT_LIVE_CSV_COMPAT)
        try:
            with open(OUTPUT_LIVE_CSV_COMPAT, "a", newline="", encoding="utf-8") as f2:
                w2 = csv.writer(f2)
                if not compat_exists:
                    w2.writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav", "url"])  # заголовки
                hhmmss = datetime.now().strftime("%H:%M:%S")
                no_bt_3, with_h2h_3, log3, idx3 = metrics
                w2.writerow([
                    hhmmss,
                    favorite,
                    opponent,
                    (f"{no_bt_3:.1f}" if isinstance(no_bt_3, (int, float)) else ""),
                    (f"{with_h2h_3:.1f}" if isinstance(with_h2h_3, (int, float)) else ""),
                    (f"{log3:.0f}" if isinstance(log3, (int, float)) else ""),
                    (f"{idx3:.0f}" if isinstance(idx3, (int, float)) else ""),
                    _canonical_stats_url(url),
                ])
        except Exception as e:
            print(f"[save] warn: cannot write to {OUTPUT_LIVE_CSV_COMPAT}: {e}")


## extract_current_score удалён по запросу; формат CSV без счёта


def load_processed_urls(processed_path: str) -> Set[str]:
    # Режим "свежий запуск": игнорировать прошлые processed
    if os.getenv("AUTOBET_FRESH") or globals().get('_IGNORE_PROCESSED'):
        return set()
    try:
        with open(processed_path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    except Exception:
        return set()


def save_processed_urls(data: Set[str], processed_path: str) -> None:
    try:
        with open(processed_path, "w", encoding="utf-8") as f:
            json.dump(sorted(list(data)), f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def restart_scan(context, page, filters: Optional[List[str]] = None, stop_event: Optional[threading.Event] = None) -> None:
    if not _SCAN_LOCK.acquire(blocking=False):
        print("[restart] Уже идёт сканирование — пропускаю запрос")
        return
    try:
        # Обновим визуальный фильтр на live-странице (чтобы UI сразу показывал только нужные лиги)
        try:
            # reuse excluded from main args/env and apply to all frames
            try:
                args = parse_args_for_runtime()
                excluded = getattr(args, 'exclude', None)
            except Exception:
                excluded = None
            if not excluded:
                ex_env = os.getenv('AUTOBET_EXCLUDE', '')
                if ex_env:
                    excluded = [s.strip() for s in ex_env.split(',') if s.strip()]
            allowed_js = json.dumps(filters or DEFAULT_FILTERS, ensure_ascii=False)
            excluded = (excluded or []) + ALWAYS_EXCLUDED
            excluded_js = json.dumps(excluded, ensure_ascii=False)
            page.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
        except Exception:
            pass
        # Не очищаем результаты при повторных пересканах.
        # Файлы перезатираются ТОЛЬКО при запуске программы (см. run()).

        # 1) LIVE: текущая страница
        page.wait_for_timeout(800)
        # Убедимся, что на странице появились ссылки на статистику
        try:
            import time as _t
            start = _t.monotonic()
            ok = False
            while _t.monotonic() - start < 10:
                try:
                    v = page.evaluate('() => Array.from(document.querySelectorAll("a[href*=\\"/stats/?\\\"]")).filter(a => !a.closest(".__auto-filter-hidden__")).length')
                    if isinstance(v, (int, float)) and v > 0:
                        ok = True
                        break
                except Exception:
                    pass
                page.wait_for_timeout(300)
            if not ok:
                print("[live] warn: не вижу ссылок '/stats/?' — продолжаю с текущим DOM")
            else:
                _dbg('wait', f"found {int(v)} link(s) within {round(_t.monotonic()-start,2)}s")
        except Exception:
            pass
        try:
            # Обновим список лиг с live_v2 прежде чем собирать ссылки
            _update_known_leagues_from_page(page)
            expand_live_list(page)
        except Exception:
            pass
        try:
            _dbg('scan', 'collecting links on live page')
            links = collect_filtered_stats_links(page)
            print(f"[LIVE] Найдено страниц статистики после фильтра: {len(links)}")
            _dbg('scan', f'live links collected: {len(links)}')
            try:
                globals()['_LAST_LIVE_LINKS'] = list(links)
            except Exception:
                pass
        except Exception as e:
            print(f"[LIVE] Ошибка сбора матчей: {e}")
            links = []
        # Быстро обновим live-счёты в уже отправленных сообщениях, не открывая страницы
        try:
            _refresh_live_scores(links)
        except Exception:
            pass
        # Финализируем сообщения для матчей, исчезнувших из live-списка (чтобы поставить 🏁)
        try:
            try:
                now = time.monotonic()
                current = set(_canonical_stats_url(u) for u in links)
            except Exception:
                current = set()
            # Кандидаты: были отправлены ранее, сейчас не видны, не помечены завершёнными
            for url_key in list(_TG_MSG_BY_URL.keys()):
                try:
                    canon = _canonical_stats_url(url_key)
                    if canon in current or canon in _MATCH_DONE:
                        continue
                    last = _LIVE_LAST_SEEN.get(canon)
                    if last is None or (now - last) < 60:
                        continue
                    # Есть последнее сообщение — добавим флаг завершения
                    last_text = _LAST_TG_TEXT_BY_URL.get(canon) or _LAST_TG_TEXT_BY_URL.get(url_key)
                    if last_text:
                        _upsert_tg_message(url_key, last_text, finished=True)
                except Exception:
                    continue
        except Exception:
            pass
        try:
            scan_and_save_stats(context, links, OUTPUT_LIVE_CSV, PROCESSED_LIVE_JSON, stop_event)
        except Exception as e:
            print(f"[LIVE] Ошибка обработки матчей: {e}")
        # После отправки сообщений сразу попробуем обновить счёт, чтобы не ждать следующий тик
        try:
            _refresh_live_scores(links)
        except Exception:
            pass

        # 2) PREMATCH (up-games) — временно отключено
        if PARSE_UPCOMING or os.getenv("AUTOBET_PREMATCH"):
            try:
                up = context.new_page()
                up.goto(URL_UPCOMING, wait_until="domcontentloaded", timeout=20000)
                try:
                    up.bring_to_front()
                except Exception:
                    pass
                try:
                    allowed_js = json.dumps(filters or DEFAULT_FILTERS, ensure_ascii=False)
                    # reuse excluded from main args/env
                    try:
                        args = parse_args_for_runtime()
                        excluded = getattr(args, 'exclude', None)
                    except Exception:
                        excluded = None
                    if not excluded:
                        ex_env = os.getenv('AUTOBET_EXCLUDE', '')
                        if ex_env:
                            excluded = [s.strip() for s in ex_env.split(',') if s.strip()]
                    excluded_js = json.dumps(excluded or [], ensure_ascii=False)
                    up.evaluate(FILTER_JS % {"allowed": allowed_js, "excluded": excluded_js})
                except Exception:
                    pass
                up.wait_for_timeout(800)
                try:
                    expand_live_list(up)
                except Exception:
                    pass
                try:
                    links2 = collect_filtered_stats_links(up)
                    print(f"[PREM] Найдено страниц статистики после фильтра: {len(links2)}")
                except Exception as e:
                    print(f"[PREM] Ошибка сбора матчей: {e}")
                    links2 = []
                try:
                    _refresh_live_scores(links2)
                except Exception:
                    pass
                try:
                    scan_and_save_stats(context, links2, OUTPUT_PREMA_CSV, PROCESSED_PREMA_JSON, stop_event)
                except Exception as e:
                    print(f"[PREM] Ошибка обработки матчей: {e}")
            finally:
                try:
                    up.close()
                except Exception:
                    pass
    finally:
        try:
            _SCAN_LOCK.release()
        except Exception:
            pass


def wait_for_decision_block(page, timeout_ms: int = 15000) -> bool:
    # Ждём появления блока расширения; затем делаем безопасный fallback на body
    try:
        return page.wait_for_function(
            """
            () => {
               const ex = document.querySelector('.min2-extract');
               if (ex) return true;
               const el = document.querySelector('.take-two-sets');
               if (!el) return false;
               const t = el.innerText || '';
               const hy = '[\-\u2010\u2011\u2013\u2014]'; // -, ‐, ‑, –, —
               const reGO = new RegExp('Решение\s*:\s*GO\b', 'i');
               const reWin = new RegExp('Совпадений\s*по\s*3' + hy + 'окну\s*:\s*(3/3|2/3)\b', 'i');
               const reWin2 = new RegExp('Совпадений\s*:\s*(3/3|2/3)\b', 'i');
               return reGO.test(t) || reWin.test(t) || reWin2.test(t);
            }
            """,
            timeout=timeout_ms,
        ) is not None
    except Exception:
        try:
            return page.wait_for_function(
                """
                () => {
                   const t = (document.body && document.body.innerText) || '';
                   const hy = '[\-\u2010\u2011\u2013\u2014]';
                   const reGO = new RegExp('Решение\s*:\s*GO\b', 'i');
                   const reWin = new RegExp('Совпадений\s*по\s*3' + hy + 'окну\s*:\s*(3/3|2/3)\b', 'i');
                   const reWin2 = new RegExp('Совпадений\s*:\s*(3/3|2/3)\b', 'i');
                   return reGO.test(t) || reWin.test(t) || reWin2.test(t);
                }
                """,
                timeout=max(500, timeout_ms // 2),
            ) is not None
        except Exception:
            return False


# ---------------------- fon.bet auth ----------------------

def ensure_login_fonbet(context, login: str, password: str):
    """Открыть fon.bet live table-tennis и попытаться авторизоваться.
    Возвращает страницу fon.bet (оставляет её открытой)."""
    try:
        page = context.new_page()
        page.goto(FONBET_URL, wait_until="domcontentloaded", timeout=20000)
        try:
            page.bring_to_front()
        except Exception:
            pass

        # Примем cookies, если спросят
        for text in ("Принять", "Согласен", "Accept", "I Agree", "Я согласен"):
            try:
                page.locator(f"button:has-text(\"{text}\")").first.click(timeout=1000)
            except Exception:
                pass

        if fonbet_is_logged_in(page):
            return page

        # Открыть форму входа
        for sel in (
            "button:has-text('Войти')",
            "a:has-text('Войти')",
            "button:has-text('Вход')",
            "button:has-text('Login')",
        ):
            try:
                page.locator(sel).first.click(timeout=2000)
                break
            except Exception:
                continue

        # Поля логина/пароля (часто фонбет использует phone/email + password)
        login_loc = page.locator("input[type='text'], input[type='tel'], input[type='email']").first
        pass_loc = page.locator("input[type='password']").first
        login_loc.wait_for(state="visible", timeout=7000)
        pass_loc.wait_for(state="visible", timeout=7000)
        login_loc.fill(login)
        pass_loc.fill(password)

        # Отправка формы
        submitted = False
        for sel in (
            "button[type='submit']",
            "button:has-text('Войти')",
            "button:has-text('Login')",
        ):
            try:
                page.locator(sel).first.click(timeout=2000)
                submitted = True
                break
            except Exception:
                continue
        if not submitted:
            pass_loc.press("Enter")

        # Подождать индикатор входа / исчезновение формы
        page.wait_for_timeout(2000)
        if not fonbet_is_logged_in(page):
            print("[fonbet] Не удалось авторизоваться (возможно требуется 2FA/подтверждение)")
        return page
    except Exception as e:
        print(f"[fonbet] Ошибка авторизации: {e}")
        return None


def fonbet_is_logged_in(page) -> bool:
    try:
        # Эвристика: отсутствие кнопки "Войти" и наличие профиля/баланса
        login_btn = page.locator("button:has-text('Войти'), a:has-text('Войти')").first
        if login_btn.is_visible(timeout=800):
            return False
    except Exception:
        pass
    try:
        # Ищем элементы профиля/баланса/кабинета
        profile_like = page.locator("[class*='profile'], [class*='balance'], a[href*='logout']")
        return profile_like.count() > 0
    except Exception:
        return False


if __name__ == "__main__":
    raise SystemExit(main())
