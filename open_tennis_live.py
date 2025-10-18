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
from typing import List, Optional, Tuple, Set
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
FONBET_URL = "https://fon.bet/live/table-tennis"
FONBET_LOGIN_DEFAULT = "+7 916 261-82-40"
FONBET_PASSWORD_DEFAULT = "zxascvdf2Z!"

# Таймаут ожидания блока решения (может быть переопределён из аргументов)
DECISION_WAIT_MS = 2000

# Временно выключаем парсинг up-games (PREMATCH)
PARSE_UPCOMING = False

# Глобальный Telegram sender (устанавливается в run())
_TG_SENDER = None  # type: Optional[callable]

# Глобальный режим по умолчанию: отправлять ВСЕ матчи (без требования GO/3/3/2/3)
# Фильтр по лигам остаётся активным; флаг --all по-прежнему полностью убирает фильтр лиг.
ALLOW_ALL = True

# Telegram defaults (user-provided token) and chat id cache file
TG_DEFAULT_TOKEN = "8329315036:AAHEfnAf4ER7YE_dqFIsOMoO-s1b5G4kYTA"
TG_CHAT_ID_FILE = os.path.join(_HERE, ".telegram_chat_id")

DEFAULT_FILTERS = [
    # Общее правило: фильтруем по базовому названию лиги,
    # т.к. после него могут идти разные города/страны.
    "Лига Про",   # матчит любые варианты: "Лига Про. Минск", "Лига Про. Чехия" и т.п.
    "Кубок ТТ",   # матчит: "Кубок ТТ. Польша", "Кубок ТТ. Чехия" и др.
    "Сетка Кап",  # матчит любые варианты после "Сетка Кап ..."
]

# Глобальный флаг, чтобы не запускать параллельные пересканы
_SCAN_LOCK = threading.Lock()


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
    box.appendChild(btn);
    document.body.appendChild(box);
  }
  return true;
})()
"""


FILTER_JS = r"""
(() => {
  const ALLOWED = new Set(%(allowed)s);

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
      const list = Array.from(ALLOWED).map(s => `<code>${s}</code>`).join(', ');
      badge.innerHTML = `Фильтр турниров активен: ${list}`;
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
        const match = Array.from(ALLOWED).some(s => txt.includes(s));
        tr.classList.toggle('__auto-filter-hidden__', !match);
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
      const match = Array.from(ALLOWED).some(s => text.includes(s));
      el.classList.toggle('__auto-filter-hidden__', !match);
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
  setInterval(debounced, 2000);

  return true;
})()
"""


def _init_output_files():
    """Hard-reset output files and create fresh CSV with header.
    New format:
      time,favorite,opponent,
      noBT3_noH2H, noBT3_H2H, logistic3_fav, indexP3_fav,
      nb3_fav_noH2H, nb3_fav_H2H, nb3_opp_noH2H, nb3_opp_H2H,
      last10_fav, last10_opp, h2h_total, league, url
    """
    keep_csv = bool(os.getenv("AUTOBET_KEEP_CSV"))
    keep_processed = bool(os.getenv("AUTOBET_KEEP_PROCESSED"))

    # Удаляем выходные файлы, если не включён режим сохранения
    to_remove = []
    if not keep_csv:
        to_remove.extend([
            (OUTPUT_LIVE_CSV, "matches_3of3.csv"),
            (OUTPUT_LIVE_CSV_COMPAT, "live_3of3.csv"),
        ])
    if not keep_processed:
        to_remove.append((PROCESSED_LIVE_JSON, "processed_live_urls.json"))

    for path, label in to_remove:
        try:
            if os.path.exists(path):
                os.remove(path)
                print(f"[init] removed {label}: {path}")
        except Exception as e:
            print(f"[init] warn: cannot remove {label} at {path}: {e}")
    # create empty CSV with header
    try:
        if not os.path.exists(OUTPUT_LIVE_CSV):
            with open(OUTPUT_LIVE_CSV, "w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([
                    "time", "favorite", "opponent",
                    "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav",
                    "nb3_fav_noH2H", "nb3_fav_H2H", "nb3_opp_noH2H", "nb3_opp_H2H",
                    "last10_fav", "last10_opp", "h2h_total", "league", "url"
                ])
            print(f"[init] created header at {OUTPUT_LIVE_CSV}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV}: {e}")
    # инициализируем файл совместимости тем же заголовком
    try:
        if not os.path.exists(OUTPUT_LIVE_CSV_COMPAT):
            with open(OUTPUT_LIVE_CSV_COMPAT, "w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([
                    "time", "favorite", "opponent",
                    "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav",
                    "nb3_fav_noH2H", "nb3_fav_H2H", "nb3_opp_noH2H", "nb3_opp_H2H",
                    "last10_fav", "last10_opp", "h2h_total", "league", "url"
                ])
            print(f"[init] created header at {OUTPUT_LIVE_CSV_COMPAT}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV_COMPAT}: {e}")


def run(filters: List[str]) -> None:
    from playwright.sync_api import sync_playwright

    args = parse_args_for_runtime()
    global ALLOW_ALL, PARSE_UPCOMING

    # Гарантированно очищаем файлы результатов перед запуском браузера
    _init_output_files()

    with sync_playwright() as p:
        ext_path = os.path.expanduser(args.extension_path) if hasattr(args, "extension_path") and args.extension_path else None
        # Настройка прокси: берём из --proxy или переменных окружения
        proxy_cfg = None
        try:
            if getattr(args, 'proxy', None):
                proxy_cfg = { 'server': str(args.proxy) }
                print(f"[net] proxy enabled: {args.proxy}")
        except Exception:
            pass

        context = None
        page = None

        # Enable PREMATCH if requested
        try:
            if getattr(args, 'prematch', False):
                PARSE_UPCOMING = True
        except Exception:
            pass

        # Учитываем флаг all: отключаем фильтрацию турниров и сохраняем все матчи
        try:
            if getattr(args, 'all', False):
                # Пустая строка в ALLOWED заставляет фильтр пропускать все строки
                filters[:] = [""]
                ALLOW_ALL = True
        except Exception:
            pass

        # Новый режим: слать все матчи, но только из выбранных лиг (фильтр лиг сохраняем)
        try:
            if getattr(args, 'all_in_leagues', False) or os.getenv('AUTOBET_ALL_IN_LEAGUES'):
                ALLOW_ALL = True
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
                    api_base = f"https://api.telegram.org/bot{token}/sendMessage"
                    def _send(text: str):
                        try:
                            data = _urlparse.urlencode({
                                'chat_id': chat_id,
                                'text': text,
                                'parse_mode': 'HTML',
                                'disable_web_page_preview': 'true'
                            }).encode('utf-8')
                            req = _urlrequest.Request(api_base, data=data)
                            _urlrequest.urlopen(req, timeout=10)
                        except Exception:
                            pass
                    global _TG_SENDER
                    _TG_SENDER = _send
                    # Startup ping so user sees bot is alive
                    try:
                        ts = datetime.now().isoformat(timespec="seconds")
                        _TG_SENDER(f"✅ Autobet started {ts}. Chat: {chat_id}")
                    except Exception as e:
                        try:
                            print(f"[tg] warn: cannot send startup ping: {e}")
                        except Exception:
                            pass
                else:
                    print("[tg] Включено -tg, но не удалось определить chat_id. Напишите любое сообщение боту и перезапустите.")
        except Exception:
            pass

        if ext_path and os.path.isdir(ext_path):
            # Use persistent context to load extension
            user_data_dir = os.path.join(os.path.dirname(__file__), ".chromium-profile")
            os.makedirs(user_data_dir, exist_ok=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir,
                headless=bool(getattr(args, 'headless', False)),
                proxy=proxy_cfg,
                args=[
                    f"--disable-extensions-except={ext_path}",
                    f"--load-extension={ext_path}",
                ],
            )
            page = context.new_page() if len(context.pages) == 0 else context.pages[0]
        else:
            # Regular non-persistent context (no extension)
            browser = p.chromium.launch(headless=bool(getattr(args, 'headless', False)), proxy=proxy_cfg)
            storage = AUTH_STATE_PATH if os.path.exists(AUTH_STATE_PATH) else None
            context = browser.new_context(storage_state=storage)
            page = context.new_page()

        # Применим таймаут ожидания решения из аргументов
        try:
            global DECISION_WAIT_MS
            DECISION_WAIT_MS = max(500, int(getattr(args, 'decision_wait_ms', DECISION_WAIT_MS)))
        except Exception:
            pass

        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=20000)
        except Exception as e:
            print("Ошибка: Page.goto не открыл live:", e)
            print("Подсказка: проверьте интернет/VPN/прокси.\n"
                  " - Можно запустить с --proxy=http://host:port (или AUTOBET_PROXY).\n"
                  " - Убедитесь, что выполнены 'pip install playwright' и 'playwright install'.")
            raise

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
        if not ensure_login(context, page, email, password):
            print("[login] Предупреждение: не удалось войти. Продолжаю без авторизации.")

        allowed_js = json.dumps(filters, ensure_ascii=False)
        page.evaluate(FILTER_JS % {"allowed": allowed_js})

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
                        if os.getenv("AUTOBET_CONSOLE") or (isinstance(text, str) and "AUTO:" in text):
                            print(f"[console:{ctype}] {text}")
                    except Exception:
                        pass
                page.on("console", _console)
            except Exception:
                pass

        # Экспортируем функцию перезапуска в страницу и рендерим кнопку управления
        # Также готовим мгновенное завершение по Enter (только в видимом режиме)
        stop_event = threading.Event()
        # Активируем ожидание Enter и UI-кнопку только в интерактивном TTY-режиме
        if not getattr(args, 'headless', False) and sys.stdin and sys.stdin.isatty():
            def _wait_for_enter():
                try:
                    input()
                except Exception:
                    pass
                stop_event.set()

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
            except Exception:
                # Если уже экспортирована — игнорируем
                pass
            try:
                page.evaluate(CONTROL_JS)
                page.evaluate("console.info('AUTO:controls ready')")
            except Exception:
                pass

        # Первый прогон
        try:
            restart_scan(context, page, filters, stop_event)
        except Exception as e:
            print(f"[scan] Ошибка первого прогона: {e}")

        # Фоновый режим: переcкан списка каждые interval_sec в течение bg_minutes
        try:
            bg_minutes = getattr(args, 'bg_minutes', None)
            interval_sec = getattr(args, 'bg_interval', None)
        except Exception:
            bg_minutes, interval_sec = None, None

        if bg_minutes is None:
            bg_minutes = 30
        if interval_sec is None:
            interval_sec = 60

        # Поддержка бесконечного режима при bg_minutes <= 0
        infinite = False
        try:
            infinite = int(bg_minutes) <= 0
        except Exception:
            infinite = False

        if infinite:
            print(f"[bg] Бесконечный режим: шаг {interval_sec} сек")
            deadline = float('inf')
        else:
            print(f"[bg] Запуск фонового сканирования: {bg_minutes} мин, шаг {interval_sec} сек")
            deadline = time.monotonic() + bg_minutes * 60
        try:
            while time.monotonic() < deadline and not stop_event.is_set():
                try:
                    page.evaluate("console.info('AUTO:bg tick')")
                except Exception:
                    pass
                try:
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
    parser.add_argument("--email", dest="email", help="Email для авторизации (иначе TENNIS_EMAIL или значение по умолчанию)")
    parser.add_argument("--password", dest="password", help="Пароль для авторизации (иначе TENNIS_PASSWORD или значение по умолчанию)")
    parser.add_argument(
        "--extension-path",
        dest="extension_path",
        default=DEFAULT_EXTENSION_PATH,
        help="Путь к Chrome-расширению (будет загружено в persistent-профиль)",
    )
    # Proxy settings for Chromium (helps if сайт заблокирован/требуется VPN)
    parser.add_argument(
        "--proxy",
        dest="proxy",
        default=os.getenv("AUTOBET_PROXY") or os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY"),
        help="HTTP(S) прокси: например http://user:pass@host:port (либо AUTOBET_PROXY/HTTPS_PROXY/HTTP_PROXY)",
    )
    # Фоновый режим (без окон): поддерживаем краткую форму -fon и длинную --headless
    parser.add_argument("-fon", "--headless", dest="headless", action="store_true",
                        help="Запуск Chromium в фоне (без окон). Требует поддержку headless-режима для расширений.")
    parser.add_argument("--fonbet-login", dest="fonbet_login", help="Логин (email/телефон) для fon.bet (или FONBET_LOGIN)")
    parser.add_argument("--fonbet-password", dest="fonbet_password", help="Пароль для fon.bet (или FONBET_PASSWORD)")
    parser.add_argument("--bg-minutes", dest="bg_minutes", type=int, default=30,
                        help="Сколько минут сканировать в фоне (0 или <0 — бесконечно, по умолчанию 30)")
    parser.add_argument("--bg-interval", dest="bg_interval", type=int, default=60, help="Интервал между пересканами, сек (по умолчанию 60)")
    parser.add_argument("--decision-wait-ms", dest="decision_wait_ms", type=int, default=2000,
                        help="Сколько миллисекунд ждать отрисовку блока решения (по умолчанию 2000)")
    parser.add_argument("--prematch", dest="prematch", action="store_true",
                        help="Также парсить up-games (PREMATCH) и сохранять в prema_3of3.csv")
    parser.add_argument("--all-in-leagues", dest="all_in_leagues", action="store_true",
                        help="Отправлять статистику по ВСЕМ матчам ТОЛЬКО из выбранных лиг (игнорировать GO/3/3)")
    # Telegram options
    parser.add_argument("-tg", "--tg", dest="tg", action="store_true", help="Отправлять подходящие матчи в Telegram")
    parser.add_argument("--tg-token", dest="tg_token", default=os.getenv("TELEGRAM_BOT_TOKEN", TG_DEFAULT_TOKEN), help="Telegram Bot API token (или TELEGRAM_BOT_TOKEN)")
    parser.add_argument("--tg-chat", dest="tg_chat", default=os.getenv("TELEGRAM_CHAT_ID"), help="Telegram chat id (или TELEGRAM_CHAT_ID)")
    # Режим: сохранять и отправлять ВСЕ матчи, игнорируя условие GO/3/3/2/3; также отключает фильтр турниров
    parser.add_argument("-all", "--all", dest="all", action="store_true",
                        help="Парсить все матчи (без условия GO/3/3/2/3) и отправлять все страницы статистики. Отключает фильтрацию по турнирам.")
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

def collect_filtered_stats_links(page) -> List[Tuple[str, Optional[str]]]:
    base = "https://tennis-score.pro"
    # Собираем видимые ссылки на страницу статистики из отфильтрованных строк
    items: List[Tuple[str, Optional[str]]] = []
    seen = set()
    anchors = page.locator("a[href*='/stats/?']")
    count = anchors.count()
    for i in range(count):
        a = anchors.nth(i)
        try:
            # пропустим элементы внутри скрытых строк фильтра
            hidden = a.evaluate("el => !!el.closest('__auto-filter-hidden__') || !!el.closest('.__auto-filter-hidden__')")
            if hidden:
                continue
            href = a.get_attribute("href") or ""
            if not href or href.startswith("#"):
                continue
            abs_url = urljoin(base, href)
            # Пытаемся угадать лигу по тексту строки
            try:
                row_text = a.evaluate("el => (el.closest('tr') || el.closest('.row') || el.closest('[role=\\'row\\']') || el).innerText || ''") or ""
            except Exception:
                row_text = ""
            league_guess = None
            if row_text:
                tlow = str(row_text).lower()
                for tok in DEFAULT_FILTERS:
                    try:
                        t = str(tok).strip()
                        if t and t.lower() in tlow:
                            league_guess = t
                            break
                    except Exception:
                        continue
            if abs_url not in seen:
                items.append((abs_url, league_guess))
                seen.add(abs_url)
        except Exception:
            continue
    return items


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
                        clicked = True
                        page.wait_for_timeout(pause_ms)
                        break
                except Exception:
                    continue
            if not clicked:
                break

        # Прокрутка страницы для загрузки виртуализированных элементов
        last_height = 0
        for _ in range(max_scrolls):
            height = page.evaluate("() => document.scrollingElement ? document.scrollingElement.scrollHeight : document.body.scrollHeight")
            if not isinstance(height, (int, float)):
                break
            if height <= last_height:
                break
            last_height = height
            page.evaluate("h => window.scrollTo(0, h)", height)
            page.wait_for_timeout(pause_ms)
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

    if not (has_go or has_33 or has_23):
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


def scan_and_save_stats(context, links: List, output_csv: str, processed_path: str, stop_event: Optional[threading.Event] = None) -> None:
    processed = load_processed_urls(processed_path)
    skipped_processed = 0
    visited = 0
    saved = 0
    for _item in links:
        if isinstance(_item, (list, tuple)) and len(_item) >= 1:
            url = _item[0]
            league_hint = (_item[1] if len(_item) > 1 else None)
        else:
            url = _item
            league_hint = None
        if stop_event is not None and stop_event.is_set():
            print("[stop] Прервано пользователем (Enter)")
            break
        if url in processed:
            skipped_processed += 1
            if os.getenv("AUTOBET_DEBUG"):
                print(f"[skip:processed] {url}")
            continue
        try:
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
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
            try:
                wait_for_decision_block(page, timeout_ms=DECISION_WAIT_MS)
            except Exception:
                pass
            lp, rp = parse_players_from_stats_url(url)
            fav, opp, _, reason = extract_favorite_and_opponents(page, lp=lp, rp=rp)
            # Если не нашли сразу — краткая повторная попытка
            if not (fav and opp and reason):
                try:
                    page.wait_for_timeout(min(2000, max(500, DECISION_WAIT_MS // 2)))
                except Exception:
                    pass
                fav, opp, _, reason = extract_favorite_and_opponents(page, lp=lp, rp=rp)
            # Если режим ALLOW_ALL и не определён фаворит — подставим имена из URL/DOM
            if ALLOW_ALL and (not fav or not opp):
                try:
                    # Попробуем взять из URL
                    lp2, rp2 = parse_players_from_stats_url(url)
                    if not fav and lp2:
                        fav = lp2
                    if not opp and rp2:
                        opp = rp2
                    # Если ещё нет — из DOM
                    if not fav or not opp:
                        names = page.evaluate("""
                            () => {
                              const set = new Set();
                              const add = s => { if (s) { s = String(s).trim(); if (s && s.length <= 40) set.add(s); } };
                              document.querySelectorAll('.table-top .gamer-name, a[href*="/players/"]').forEach(el => add(el.textContent));
                              const arr = Array.from(set).filter(Boolean);
                              return arr.slice(0,2);
                            }
                        """) or []
                        if isinstance(names, list):
                            if not fav and len(names) >= 1:
                                fav = names[0]
                            if not opp and len(names) >= 2:
                                opp = names[1]
                except Exception:
                    pass

            if fav and opp and (reason or ALLOW_ALL):
                # Извлечь метрики для новой строки CSV
                metrics = _extract_metrics_for_csv(page, fav, opp)
                # Попробовать извлечь последовательность last10 (кружочки)
                last10_fav = None
                last10_opp = None
                nb3_fav_no = None
                nb3_fav_h2 = None
                nb3_opp_no = None
                nb3_opp_h2 = None
                try:
                    # Короткое ожидание появления блока сравнения/точек
                    try:
                        page.wait_for_function("() => !!document.querySelector('.min2-compare .cmp-row.last10 .fav.last10 .dot, .fav.last10 .dot')", timeout=1200)
                    except Exception:
                        pass
                    try:
                        page.wait_for_function("() => !!document.querySelector('.table-top .total, .total')", timeout=1200)
                    except Exception:
                        pass
                    hs = _extract_h2h_and_score(page, fav, opp) or {}
                    last10_fav = hs.get('favDots') or None
                    last10_opp = hs.get('oppDots') or None
                    h2h_total = hs.get('score') or None
                    # Попробуем вытащить nb3 без/с H2H для фаворита и оппонента
                    try:
                        cmp = _extract_compare_block(page)
                    except Exception:
                        cmp = None
                    if isinstance(cmp, dict):
                        nb = cmp.get('nb3') or {}
                        fav_nb = nb.get('fav') or {}
                        opp_nb = nb.get('opp') or {}
                        def _num(x):
                            try:
                                return float(x) if isinstance(x, (int, float)) else (float(str(x).replace(',', '.')) if isinstance(x, str) and x else None)
                            except Exception:
                                return None
                        nb3_fav_no = _num(fav_nb.get('noH2H'))
                        nb3_fav_h2 = _num(fav_nb.get('h2h'))
                        nb3_opp_no = _num(opp_nb.get('noH2H'))
                        nb3_opp_h2 = _num(opp_nb.get('h2h'))
                        # Fallbacks for dots and H2H score from compare block
                        if not last10_fav:
                            last10_fav = ((cmp.get('last10') or {}).get('favDots')) or last10_fav
                        if not last10_opp:
                            last10_opp = ((cmp.get('last10') or {}).get('oppDots')) or last10_opp
                        if not h2h_total:
                            h2h_total = cmp.get('h2hScore') or h2h_total
                except Exception:
                    pass
                league = league_hint or _extract_league_name(page)
                save_match_row(
                    url, fav, opp, metrics, output_csv,
                    last10_fav=last10_fav, last10_opp=last10_opp,
                    nb3_fav_no=nb3_fav_no, nb3_fav_h2=nb3_fav_h2,
                    nb3_opp_no=nb3_opp_no, nb3_opp_h2=nb3_opp_h2,
                    h2h_total=h2h_total,
                    league=league,
                )
                # Telegram notify if configured (new formatted message using compare block if available)
                try:
                    if _TG_SENDER:
                        compare = _extract_compare_block(page)
                        # Enrich/override H2H dots and score via generic DOM extractor
                        try:
                            # Wait up to ~4s in total for all key blocks
                            page.wait_for_function(
                                "() => !!document.querySelector('.min2-compare')",
                                timeout=1200,
                            )
                        except Exception:
                            pass
                        try:
                            page.wait_for_function(
                                "() => !!document.querySelector('.min2-compare .cmp-row.last10 .fav.last10 .dot, .fav.last10 .dot')",
                                timeout=1800,
                            )
                        except Exception:
                            pass
                        try:
                            page.wait_for_function(
                                "() => !!document.querySelector('table.kmp_srt_results.main-table tbody tr.personal-meetings')",
                                timeout=1500,
                            )
                        except Exception:
                            pass
                        try:
                            page.wait_for_function(
                                "() => !!document.querySelector('.table-top .total')",
                                timeout=1500,
                            )
                        except Exception:
                            pass
                        try:
                            hs = _extract_h2h_and_score(page, fav, opp)
                        except Exception:
                            hs = { 'favDots': None, 'oppDots': None, 'score': None }
                        if not isinstance(compare, dict):
                            compare = {
                                'favName': fav,
                                'oppName': opp,
                                'nb3': { 'fav': {}, 'opp': {} },
                                'ml3': { 'fav': None, 'opp': None },
                                'idx3': { 'fav': None, 'opp': None },
                                'd35': { 'fav': None, 'opp': None },
                            }
                        # Override names from compare header if present (cleaned)
                        try:
                            fn = _clean_name(compare.get('favName')) if isinstance(compare, dict) else None
                            on = _clean_name(compare.get('oppName')) if isinstance(compare, dict) else None
                            if fn and on:
                                fav, opp = fn, on
                        except Exception:
                            pass
                        # Apply H2H data
                        try:
                            h2h_f = (hs.get('h2hFav') if isinstance(hs, dict) else None) or hs.get('favDots')
                            h2h_o = (hs.get('h2hOpp') if isinstance(hs, dict) else None) or hs.get('oppDots')
                            if h2h_f or h2h_o:
                                compare['h2hDots'] = { 'fav': h2h_f, 'opp': h2h_o }
                            if hs.get('score'):
                                compare['h2hScore'] = hs.get('score')
                        except Exception:
                            pass
                        league = league_hint or _extract_league_name(page)
                        msg = _format_tg_message_new(fav, opp, url, compare, metrics, compare.get('h2hScore'), league=league)
                        try:
                            msg = _cleanup_tg_text(msg)
                        except Exception:
                            pass
                        _TG_SENDER(msg)
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
                page.close()
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

def _clean_name(s: Optional[str]) -> Optional[str]:
    """Strip emojis/symbols and excessive spaces from a player name.
    Returns a readable name or None.
    """
    if not isinstance(s, str):
        return None
    # Remove most emoji/symbol ranges and trim
    t = re.sub(r"[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u2600-\u27BF\U0001F000-\U0001FAFF]", " ", s)
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


def _extract_league_name(page) -> Optional[str]:
    """Try to extract league/tournament name from the stats page.
    Heuristic: look for known base tokens (DEFAULT_FILTERS) in the page text
    and return the longest matching token; otherwise None.
    """
    # 1) Try common selectors near the header/breadcrumbs
    try:
        text_candidates = page.evaluate(
            """
            () => {
              const pick = (sel) => Array.from(document.querySelectorAll(sel))
                 .map(el => (el.innerText||el.textContent||'').trim()).filter(Boolean);
              const arr = [];
              arr.push(...pick('.breadcrumbs, .breadcrumb, nav[aria-label="breadcrumb"]'));
              arr.push(...pick('.table-top, .container-xl .mb-5, .container-xl'));
              arr.push(...pick('h1, h2, .badge, .label, .tournament, .league'));
              return arr.slice(0, 50).join('\n');
            }
            """
        ) or ''
    except Exception:
        text_candidates = ''
    # 2) Fallback to full body text
    if not text_candidates:
        try:
            text_candidates = page.locator('body').inner_text(timeout=1500)
        except Exception:
            text_candidates = ''
    if not text_candidates:
        return None
    text_low = str(text_candidates).lower()
    candidates = []
    for tok in (DEFAULT_FILTERS or []):
        try:
            t = str(tok).strip()
            if not t:
                continue
            if t.lower() in text_low:
                candidates.append(t)
        except Exception:
            continue
    if candidates:
        # prefer the longest token (e.g., 'Кубок ТТ' over 'Кубок')
        candidates.sort(key=lambda s: (-len(s), s))
        return candidates[0]
    return None


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

    # 2) Fallback: scan body text
    try:
        body = page.locator('body').inner_text(timeout=1500)
    except Exception:
        body = ""
    if body:
        text = re.sub(r"\s+", " ", body)
        # Avoid matching times like 00:49 by preferring small numbers or nearby keywords
        m = re.search(r"(?:сч[её]т|сеты|sets|по\s*сетам)[^\d]{0,20}(\d{1,2})\s*[:\-–—]\s*(\d{1,2})", text, re.IGNORECASE)
        if not m:
            m = re.search(r"\b([0-5])\s*[:\-–—]\s*([0-5])\b", text)
        if not m:
            m = re.search(r"\b(\d{1,2})\s*[:\-–—]\s*(\d{1,2})\b", text)
        if m:
            return f"{m.group(1)}:{m.group(2)}"
    return None


def _extract_h2h_and_score(page, fav: Optional[str] = None, opp: Optional[str] = None) -> dict:
    """Extract H2H dots (fav/opp) from DOM, preferably from a combined last10 row,
    and an H2H score from a nearby <div class="total">L : R</div> within the same block.
    Returns dict: { 'favDots': str|None, 'oppDots': str|None, 'score': str|None }.
    """
    try:
        FAV = _norm_name(fav) if fav else ''
        OPP = _norm_name(opp) if opp else ''
        res = page.evaluate(
            """
            (FAV, OPP) => {
              const out = { favDots: null, oppDots: null, h2hFav: null, h2hOpp: null, score: null };
              const normName = (s) => (s||'')
                .replace(/[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u2600-\u27BF\u1F000-\u1FAFF]/g,' ')
                .replace(/^[^\p{L}\p{N}]+/gu,'')
                .replace(/[^\p{L}\p{N}\s]+/gu,' ')
                .replace(/\s+/g,' ').trim().toLowerCase();
              const mapDots = (el) => {
                if (!el) return null;
                const dots = el.querySelectorAll('.dot');
                if (!dots || dots.length === 0) return null;
                const arr = [];
                for (const d of dots) {
                  arr.push(d.classList.contains('dot-win') ? '🟢' : (d.classList.contains('dot-loss') ? '🔴' : ''));
                }
                return arr.join('');
              };
              // Prefer exact block .min2-compare
              const root = document.querySelector('.min2-compare') || document;
              // Exact last10 node for favorite inside this block
              let favLast = root.querySelector('.cmp-row.last10 .fav.last10');
              if (!favLast) favLast = root.querySelector('.fav.last10');
              // Opponent last10, if present as separate node
              let oppLast = root.querySelector('.cmp-row.last10 .opp.last10');
              if (!oppLast) oppLast = root.querySelector('.opp.last10');
              let favDots = mapDots(favLast);
              let oppDots = mapDots(oppLast);
              if (!oppDots && favDots) {
                oppDots = favDots.split('').map(ch => ch === '🟢' ? '🔴' : (ch === '🔴' ? '🟢' : ch)).join('');
              }
              out.favDots = favDots || null;
              out.oppDots = oppDots || null;
              // Build H2H dots from personal-meetings table if present
              try {
                  // Detect left/right names from nearest .table-top
                  let lName = '', rName = '';
                  const nearTotal = (root.closest('#stats-base')||document).querySelector('.table-top .total');
                  const nearTop = nearTotal ? nearTotal.closest('.table-top') : null;
                  if (nearTop) {
                    const nms = nearTop.querySelectorAll('.gamer-name');
                    lName = nms && nms[0] ? nms[0].textContent : '';
                    rName = nms && nms[1] ? nms[1].textContent : '';
                  }
                  lName = normName(lName); rName = normName(rName);
                  const favIsLeft = !!(FAV && lName && FAV === lName);
                  // Find H2H main table
                  const base = (root.closest('#stats-base')||document);
                  // Prefer non-clone main table
                  let mainTbody = base.querySelector('table.kmp_srt_results.main-table:not(.clone) tbody');
                  if (!mainTbody) mainTbody = base.querySelector('table.kmp_srt_results.main-table tbody');
                  const rows = mainTbody ? Array.from(mainTbody.querySelectorAll('tr.personal-meetings')).slice(0, 12) : [];
                  if (rows.length) {
                    const seq = [];
                    for (const tr of rows) {
                      const leftWon = tr.classList.contains('win');
                      const favWon = favIsLeft ? leftWon : !leftWon;
                      seq.push(favWon ? '🟢' : '🔴');
                    }
                    if (seq.length) {
                      out.h2hFav = seq.join('');
                      out.h2hOpp = seq.map(ch => ch === '🟢' ? '🔴' : '🟢').join('');
                    }
                  }
              } catch(_){ }
              // Score from <div class="total">L : R</div>
              // Score from DOM: prefer nearest .table-top .total relative to min2-compare
              let L = null, R = null;
              const findNearestTotal = (r) => {
                if (!r) return document.querySelector('.table-top .total, .total');
                // Check siblings after the compare block
                let p = r.parentElement;
                for (let n = r.nextElementSibling; n; n = n.nextElementSibling) {
                  const t = n.querySelector('.table-top .total, .total');
                  if (t) return t;
                }
                // Then siblings before
                for (let n = r.previousElementSibling; n; n = n.previousElementSibling) {
                  const t = n.querySelector('.table-top .total, .total');
                  if (t) return t;
                }
                // Finally within parent
                if (p) {
                  const t = p.querySelector('.table-top .total, .total');
                  if (t) return t;
                }
                return document.querySelector('.table-top .total, .total');
              };
              let cont = findNearestTotal(root);
              if (cont) {
                const s = (cont.innerText || cont.textContent || '').trim();
                const m = s.match(/(\d{1,2})\s*[:\-–—]\s*(\d{1,2})/);
                if (m) { L = m[1]; R = m[2]; }
                // Try to orient by nearby gamer-name nodes
                const row = cont.closest('.table-top') || cont.parentElement;
                if (row) {
                  const names = row.querySelectorAll('.gamer-name');
                  let leftName = names && names[0] ? names[0].textContent : '';
                  let rightName = names && names[1] ? names[1].textContent : '';
                  leftName = normName(leftName);
                  rightName = normName(rightName);
                  if (L !== null && R !== null) {
                    if (FAV && leftName && FAV === leftName) out.score = `${L}:${R}`;
                    else if (FAV && rightName && FAV === rightName) out.score = `${R}:${L}`;
                    else out.score = `${L}:${R}`;
                  }
                } else if (L !== null && R !== null) {
                  out.score = `${L}:${R}`;
                }
              }
              return out;
            }
            """,
            FAV, OPP,
        )
        if isinstance(res, dict):
            return res
    except Exception:
        pass
    return { 'favDots': None, 'oppDots': None, 'score': None }


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
              // Visualization rows for each player (recent results, not H2H)
              let favVizEl = root.querySelector('.cmp-row.viz .fav.viz');
              let oppVizEl = root.querySelector('.cmp-row.viz .opp.viz');
              const rFavViz = readDots(favVizEl);
              const rOppViz = readDots(oppVizEl);
              // Per user request: use last10 row as H2H series relative to favorite
              let h2hFav = rFav;
              let h2hOpp = rOpp && rOpp.dots ? rOpp : (function(){
                const inv = (rFav.dots || '').split('').map(ch => ch === '🟢' ? '🔴' : (ch === '🔴' ? '🟢' : ch)).join('');
                return { dots: inv, w: null, l: null };
              })();
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
              return {
                favName, oppName,
                nb3: { fav: { noH2H: nbFav_no, h2h: nbFav_h2 }, opp: { noH2H: nbOpp_no, h2h: nbOpp_h2 } },
                ml3: { fav: mlFav, opp: mlOpp },
                idx3: { fav: idxFav, opp: idxOpp },
                d35: { fav: dFav || null, opp: dOpp || null },
                last10: { favDots: rFav.dots, favW: rFav.w, favL: rFav.l, oppDots: rOpp.dots, oppW: rOpp.w, oppL: rOpp.l },
                viz10:  { favDots: rFavViz.dots, oppDots: rOppViz.dots },
                h2hDots: { fav: h2hFav.dots, opp: h2hOpp.dots },
                h2hScore,
              };
            }
            """
        )
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def _format_tg_message_new(fav: str, opp: str, url: str, compare: Optional[dict], fallback_metrics: Tuple[Optional[float], Optional[float], Optional[float], Optional[float]], h2h_score: Optional[str] = None, league: Optional[str] = None) -> str:
    """Compact message with aligned columns under player names.
    Uses a <pre> block to keep spacing and aligns left/right values in columns
    so each metric stays directly under the corresponding player name.
    Also adds optional H2H score+dots as a separate line before the link.
    """
    ts = datetime.now().strftime('%H:%M')
    # Escape helper
    def esc(s: str) -> str:
        return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if isinstance(s, str) else s)

    # Extract values if available
    d_f = d_o = '—'
    ml_f = ml_o = None
    idx_f = idx_o = None
    nb_fav_no = nb_fav_h2 = nb_opp_no = nb_opp_h2 = None
    if isinstance(compare, dict):
        try:
            d35 = compare.get('d35') or {}
            d_f = d35.get('fav') or d_f
            d_o = d35.get('opp') or d_o
            ml = compare.get('ml3') or {}
            ml_f = ml.get('fav') if ml.get('fav') is not None else ml_f
            ml_o = ml.get('opp') if ml.get('opp') is not None else ml_o
            idx = compare.get('idx3') or {}
            idx_f = idx.get('fav') if idx.get('fav') is not None else idx_f
            idx_o = idx.get('opp') if idx.get('opp') is not None else idx_o
            nb = compare.get('nb3') or {}
            fav_nb = nb.get('fav') or {}
            opp_nb = nb.get('opp') or {}
            nb_fav_no = fav_nb.get('noH2H')
            nb_fav_h2 = fav_nb.get('h2h')
            nb_opp_no = opp_nb.get('noH2H')
            nb_opp_h2 = opp_nb.get('h2h')
        except Exception:
            pass

    # Fallback to metrics
    if ml_f is None or idx_f is None:
        no_bt_3, with_h2h_3, log3, idx3 = fallback_metrics
        if ml_f is None and isinstance(log3, (int, float)):
            ml_f = log3
        if idx_f is None and isinstance(idx3, (int, float)):
            idx_f = idx3

    def pct0(v):
        try:
            return f"{float(v):.0f}%"
        except Exception:
            return '—'

    # Build aligned two-column block inside <pre> ... </pre>
    def s(v):
        return '' if v is None else str(v)
    left_title = s(fav)
    right_title = s(opp)
    # Compact two-sided lines and center values under names, keep central bar under VS
    # Visual width that treats emoji/symbols as double-width to stabilize alignment
    EMO_WIDE = set('🟢🔴🟩🟥📈👤👥📊💪🏆🚩→↑↓±')
    def width(t: str) -> int:
        s0 = '' if t is None else str(t)
        w = 0
        for ch in s0:
            code = ord(ch)
            if ch in EMO_WIDE or 0x1F300 <= code <= 0x1FAFF:
                w += 2
            else:
                w += 1
        return w
    # Keep ML marker out of table cells for alignment stability
    def mark(v):
        return ''
    # Prepare raw value strings
    val_d_f = s(d_f)
    val_d_o = s(d_o)
    val_nb_no_f = pct0(nb_fav_no)
    val_nb_no_o = pct0(nb_opp_no)
    val_nb_h2_f = pct0(nb_fav_h2)
    val_nb_h2_o = pct0(nb_opp_h2)
    val_ml_f = pct0(ml_f)
    val_ml_o = pct0(ml_o)
    mlf = mark(ml_f); mlo = mark(ml_o)
    # Use numeric-only cells
    val_ml_f_col = val_ml_f
    val_ml_o_col = val_ml_o
    val_idx_f = pct0(idx_f)
    val_idx_o = pct0(idx_o)
    # Last 10 games dots per player from compare.viz10 if available (fallback to last10/H2H visualization)
    last10_fav = last10_opp = None
    try:
        if isinstance(compare, dict):
            v10 = compare.get('viz10') or {}
            let_f = v10.get('favDots') or ''
            let_o = v10.get('oppDots') or ''
            # fallback to previous last10 block (which might be H2H visualization)
            if not let_f and not let_o:
                l10 = compare.get('last10') or {}
                let_f = l10.get('favDots') or ''
                let_o = l10.get('oppDots') or ''
            last10_fav = let_f if isinstance(let_f, str) and let_f else None
            last10_opp = let_o if isinstance(let_o, str) and let_o else None
            # Fallback: if only one side present, invert
            if (not last10_opp) and last10_fav:
                last10_opp = ''.join('🔴' if ch == '🟢' else ('🟢' if ch == '🔴' else ch) for ch in last10_fav)
    except Exception:
        pass
    left_vals = [val_d_f, val_nb_no_f, val_nb_h2_f, val_ml_f_col, val_idx_f] + ([last10_fav] if last10_fav else [])
    right_vals = [val_d_o, val_nb_no_o, val_nb_h2_o, val_ml_o_col, val_idx_o] + ([last10_opp] if last10_opp else [])
    left_w = max(width(fav), max(width(v) for v in left_vals))
    right_w = max(width(opp), max(width(v) for v in right_vals))
    def align(text: str, w: int, mode: str = 'center') -> str:
        txt = s(text)
        pad = max(0, w - width(txt))
        if mode == 'right':
            return (' ' * pad) + txt
        if mode == 'left':
            return txt + (' ' * pad)
        # center
        left_pad = pad // 2
        right_pad = pad - left_pad
        return (' ' * left_pad) + txt + (' ' * right_pad)
    # Build rows with a single central bar.
    # Keep a fixed-width icon column so the central bar stays perfectly aligned.
    ICONS = ['📈','👤','👥','📊','💪']
    icon_col_w = max(width(ic) for ic in ICONS) + 1  # add one space after icon
    def row(icon: str, lv: str, rv: str) -> str:
        pad_after_icon = max(0, icon_col_w - (width(icon)))
        # Right-align left column; left-align right column for stability
        return f"{icon}{' ' * pad_after_icon}{align(lv, left_w, 'right')} | {align(rv, right_w, 'left')}"
    pre_lines = [
        row('📈', val_d_f, val_d_o),
        row('👤', val_nb_no_f, val_nb_no_o),
        row('👥', val_nb_h2_f, val_nb_h2_o),
        row('📊', val_ml_f_col, val_ml_o_col),
        row('💪', val_idx_f, val_idx_o),
    ]
    pre_block = "\n".join(pre_lines)

    # Header lines (outside the table): time and player names
    title_line = esc(f"🏆 {fav} VS  🚩{opp}")
    # Build header time line with optional league
    time_line = f"⏱ {ts}" + (f" {league}" if league else "")
    parts = [
        esc(time_line),
        title_line,
    ]
    # Show last 10 games per player directly under names
    try:
        if isinstance(compare, dict):
            l10 = (compare.get('last10') or {})
            lf = last10_fav or (l10.get('favDots') or '')
            lo = last10_opp or (l10.get('oppDots') or '')
            if not lo and lf:
                lo = ''.join('🔴' if ch == '🟢' else ('🟢' if ch == '🔴' else ch) for ch in lf)
            if lf or lo:
                parts.append(esc(f"🏆 {lf}"))
                parts.append("──────────────")
                parts.append(esc(f"🚩 {lo}"))
    except Exception:
        pass
    # Replace <pre> block with per-line inline code cells to avoid Telegram 'копировать' header and emoji width issues
    def pad_fixed(text, width):
        t = '' if text is None else str(text)
        if len(t) < width:
            t = t + ' ' * (width - len(t))
        return t
    def line(icon, lv, rv, w_left, w_right):
        return f"{icon} <code>{esc(pad_fixed(lv, w_left))}</code> | <code>{esc(pad_fixed(rv, w_right))}</code>"
    parts.append(line('📈', val_d_f,       val_d_o,       10, 10))
    parts.append(line('👤', val_nb_no_f,   val_nb_no_o,    4,  4))
    parts.append(line('👥', val_nb_h2_f,   val_nb_h2_o,    4,  4))
    parts.append(line('📊', val_ml_f_col,  val_ml_o_col,   4,  4))
    parts.append(line('💪', val_idx_f,     val_idx_o,      4,  4))
    # Restore H2H line relative to favorite
    try:
        if isinstance(compare, dict):
            h2h = compare.get('h2hDots') or {}
            hf = h2h.get('fav') or ''
            sc = (h2h_score or (compare.get('h2hScore') if isinstance(compare, dict) else None)) or ''
            if hf:
                def shorten(s: str, n: int = 10) -> str:
                    s = s or ''
                    return s[-n:] if len(s) > n else s
                parts.append(esc(f"⚔️ {shorten(hf)}" if not sc else f"⚔️ ({sc}) {shorten(hf)}"))
    except Exception:
        pass
    link = esc(_canonical_stats_url(url))
    parts.append(f"<a href=\"{link}\">Статистика</a>")

    # FCI (Final Composite Index) — simplified ensemble from compare block
    try:
        fci_line = _compute_fci_line(compare, fav)
        if fci_line:
            parts.append(esc(fci_line))
    except Exception:
        pass

    # Краткая строка: Марков–BT и Топ-счёт (по 5 играм, без H2H)
    try:
        mbt_line = _compute_markov_bt_line(compare)
        if mbt_line:
            parts.append(esc(mbt_line))
    except Exception:
        pass

    return "\n".join(parts)


# ---------------------- Markov + Bradley–Terry block ----------------------
def _cleanup_tg_text(text: str) -> str:
    """Remove unwanted verbose lines like 'Fav ...', '🎯 Фаворит:', 'Комитет', 'Базовая оценка модели'."""
    try:
        bad = (
            r"^\s*Fav\b.*$",
            r"^\s*🎯\s*Фаворит\s*:.*$",
            r"^\s*Фаворит\s*:.*$",
            r"^\s*Базовая\s+оценка\s+модели.*$",
            r"^\s*Комитет.*$",
            r"^\s*комитет.*$",
            r"^\s*Calibr.*$",
            r"^\s*Калибр.*$",
        )
        lines = [ln for ln in str(text).split("\n") if ln is not None]
        out = []
        for ln in lines:
            low = ln.strip()
            if any(re.search(p, low, flags=re.IGNORECASE) for p in bad):
                continue
            out.append(ln)
        # collapse multiple blank lines
        cleaned = []
        prev_blank = False
        for ln in out:
            is_blank = (ln.strip() == '')
            if is_blank and prev_blank:
                continue
            cleaned.append(ln)
            prev_blank = is_blank
        return "\n".join(cleaned).strip()
    except Exception:
        return text
def _dots_to_wl(s: Optional[str], limit: int = 5) -> Tuple[int, int]:
    """Convert dots string like '🟢🔴…' to (wins, losses) for last `limit` items."""
    if not s:
        return 0, 0
    arr = [ch for ch in str(s) if ch in ('🟢', '🔴')][:limit]
    w = sum(1 for ch in arr if ch == '🟢')
    l = sum(1 for ch in arr if ch == '🔴')
    return w, l


def _parse_score_lr(score: Optional[str]) -> Tuple[Optional[int], Optional[int]]:
    if not score or not isinstance(score, str):
        return None, None
    m = re.search(r"(\d{1,3})\s*[:\-–—]\s*(\d{1,3})", score)
    if not m:
        return None, None
    try:
        return int(m.group(1)), int(m.group(2))
    except Exception:
        return None, None


def _combine_weighted(p_h2h: Optional[float], p_form_rel: Optional[float], p_bt: Optional[float], w=(0.4, 0.3, 0.3)) -> Optional[float]:
    parts: list[float] = []
    weights: list[float] = []
    for v, ww in ((p_h2h, w[0]), (p_form_rel, w[1]), (p_bt, w[2])):
        if v is None:
            continue
        parts.append(float(v))
        weights.append(float(ww))
    if not parts:
        return None
    ws = sum(weights)
    if ws <= 0:
        return sum(parts) / len(parts)
    return sum(v * weights[i] for i, v in enumerate(parts)) / ws


def _markov_best_of_5(p: float) -> dict:
    q = 1.0 - p
    p30 = p ** 3
    p31 = 3 * (p ** 3) * q
    p32 = 6 * (p ** 3) * (q ** 2)
    p03 = q ** 3
    p13 = 3 * (q ** 3) * p
    p23 = 6 * (q ** 3) * (p ** 2)
    pa = p30 + p31 + p32
    pb = p03 + p13 + p23
    return {'3:0': p30, '3:1': p31, '3:2': p32, '0:3': p03, '1:3': p13, '2:3': p23, 'P(A)': pa, 'P(B)': pb}


def _compute_fci_line(compare: Optional[dict], fav_name: Optional[str] = None) -> Optional[str]:
    """Compute a simplified FCI from the compare dict and return a single-line text
    like "<Fav> — FCI: NN%". Missing components are ignored and weights renormalized.
    Components used (if present):
      - base3: nb3.fav.h2h or nb3.fav.noH2H
      - form3: idx3.fav
      - logit3: ml3.fav
      - mbt: last-5 wins share for fav vs opp from viz10/last10
    """
    if not isinstance(compare, dict):
        return None
    try:
        # Percent helpers
        def pct01(x):
            try:
                if x is None:
                    return None
                if isinstance(x, (int, float)):
                    v = float(x)
                    return v/100.0 if v > 1 else (v if 0 <= v <= 1 else None)
                v = float(str(x).replace(',', '.'))
                return v/100.0 if v > 1 else (v if 0 <= v <= 1 else None)
            except Exception:
                return None

        # Base3 from non-BT (prefer with H2H)
        base3 = None
        try:
            nb = compare.get('nb3') or {}
            fav_nb = nb.get('fav') or {}
            base3 = pct01(fav_nb.get('h2h')) or pct01(fav_nb.get('noH2H'))
        except Exception:
            pass
        # Form3 from index block
        form3 = None
        try:
            idx = compare.get('idx3') or {}
            form3 = pct01(idx.get('fav'))
        except Exception:
            pass
        # Logit3
        logit3 = None
        try:
            ml = compare.get('ml3') or {}
            logit3 = pct01(ml.get('fav'))
        except Exception:
            pass
        # MBT from last-5 tokens (viz10 preferred, fallback to last10)
        mbt = None
        try:
            fav_series = ((compare.get('viz10') or {}).get('favDots')) or ((compare.get('last10') or {}).get('favDots'))
            opp_series = ((compare.get('viz10') or {}).get('oppDots')) or ((compare.get('last10') or {}).get('oppDots'))
            w1, l1 = _dots_to_wl(fav_series, 5)
            w2, l2 = _dots_to_wl(opp_series, 5)
            p1 = (w1 / (w1 + l1)) if (w1 + l1) > 0 else None
            p2 = (w2 / (w2 + l2)) if (w2 + l2) > 0 else None
            if p1 is not None and p2 is not None and (p1 + p2) > 0:
                mbt = p1 / (p1 + p2)
        except Exception:
            pass

        parts = []
        def push(val, w):
            if isinstance(val, (int, float)) and 0 <= val <= 1:
                parts.append((val, w))
        # Base weights; renormalize by available parts
        push(base3, 0.20)
        push(form3, 0.20)
        push(logit3, 0.15)
        push(mbt,   0.30)
        if not parts:
            return None
        wsum = sum(w for _, w in parts) or 1.0
        fci = sum(v * (w/wsum) for v, w in parts)
        fci = max(0.0, min(1.0, fci))
        name = fav_name or (compare.get('favName') if isinstance(compare.get('favName'), str) else None)
        if name:
            return f"{name} — FCI: {fci*100:.1f}%"
        return f"FCI: {fci*100:.1f}%"
    except Exception:
        return None

def _compute_markov_bt_line(compare: Optional[dict]) -> Optional[str]:
    """Return single-line summary: 'Марков–BT XX% и Топ-счёт: S',
    using only last 5 games of each player (no H2H)."""
    if not isinstance(compare, dict):
        return None
    fav_series = ((compare.get('viz10') or {}).get('favDots')) or ((compare.get('last10') or {}).get('favDots'))
    opp_series = ((compare.get('viz10') or {}).get('oppDots')) or ((compare.get('last10') or {}).get('oppDots'))
    w1, l1 = _dots_to_wl(fav_series, 5)
    w2, l2 = _dots_to_wl(opp_series, 5)
    p1 = (w1 / (w1 + l1)) if (w1 + l1) > 0 else None
    p2 = (w2 / (w2 + l2)) if (w2 + l2) > 0 else None
    if p1 is None or p2 is None or (p1 + p2) <= 0:
        return None
    p = p1 / (p1 + p2)
    p = max(0.01, min(0.99, float(p)))
    dist = _markov_best_of_5(p)
    pa = dist['P(A)']; pb = dist['P(B)']
    norm_p1 = pa / (pa + pb) if (pa + pb) > 0 else p
    best_score, _ = max({k: v for k, v in dist.items() if ':' in k}.items(), key=lambda kv: kv[1])
    return f"Марков–BT {int(round(norm_p1*100))}% и Топ-счёт: {best_score}"


def _compute_markov_bt_block(compare: Optional[dict], fav: str, opp: str) -> Optional[str]:
    """Markov–BT simplified: only last-5 games form for each player.
    Ignores H2H entirely. Returns formatted text or None if not enough data."""
    if not isinstance(compare, dict):
        return None
    # Prefer per-player own last results from viz10; fallback to last10
    fav_series = ((compare.get('viz10') or {}).get('favDots')) or ((compare.get('last10') or {}).get('favDots'))
    opp_series = ((compare.get('viz10') or {}).get('oppDots')) or ((compare.get('last10') or {}).get('oppDots'))

    w1, l1 = _dots_to_wl(fav_series, 5)
    w2, l2 = _dots_to_wl(opp_series, 5)
    p1 = (w1 / (w1 + l1)) if (w1 + l1) > 0 else None
    p2 = (w2 / (w2 + l2)) if (w2 + l2) > 0 else None
    if p1 is None or p2 is None or (p1 + p2) <= 0:
        return None
    # Relative probability for favorite based only on last-5 win rates
    p = p1 / (p1 + p2)
    p = max(0.01, min(0.99, float(p)))
    dist = _markov_best_of_5(p)
    pa = dist['P(A)']; pb = dist['P(B)']
    norm_p1 = pa / (pa + pb) if (pa + pb) > 0 else p
    best_score, best_val = max({k: v for k, v in dist.items() if ':' in k}.items(), key=lambda kv: kv[1])
    p45 = dist['3:1'] + dist['1:3'] + dist['3:2'] + dist['2:3']

    def pct(x: float) -> str:
        try:
            return f"{x*100:.1f}%"
        except Exception:
            return "—"

    lines = []
    lines.append("📊 Метод Маркова–Брэдли–Терри (5 игр)")
    lines.append(f"{fav} — {pct(norm_p1)}")
    lines.append(f"{opp} — {pct(1.0 - norm_p1)}")
    lines.append(f"Наиболее вероятный счёт: {best_score}")
    lines.append(f"Вероятность 4–5 сетов: {pct(p45)}")
    return "\n".join(lines)


def save_match_row(url: str, favorite: str, opponent: str, metrics: Tuple[Optional[float], Optional[float], Optional[float], Optional[float]], output_csv: str,
                   last10_fav: Optional[str] = None, last10_opp: Optional[str] = None,
                   nb3_fav_no: Optional[float] = None, nb3_fav_h2: Optional[float] = None,
                   nb3_opp_no: Optional[float] = None, nb3_opp_h2: Optional[float] = None,
                   h2h_total: Optional[str] = None,
                   league: Optional[str] = None) -> None:
    exists = os.path.exists(output_csv)
    with open(output_csv, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if not exists:
            w.writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav",
                        "nb3_fav_noH2H", "nb3_fav_H2H", "nb3_opp_noH2H", "nb3_opp_H2H",
                        "last10_fav", "last10_opp", "h2h_total", "league", "url"])  # заголовки
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
            (f"{nb3_fav_no:.1f}" if isinstance(nb3_fav_no, (int, float)) else ""),
            (f"{nb3_fav_h2:.1f}" if isinstance(nb3_fav_h2, (int, float)) else ""),
            (f"{nb3_opp_no:.1f}" if isinstance(nb3_opp_no, (int, float)) else ""),
            (f"{nb3_opp_h2:.1f}" if isinstance(nb3_opp_h2, (int, float)) else ""),
            (last10_fav or ""),
            (last10_opp or ""),
            (h2h_total or ""),
            (league or ""),
            _canonical_stats_url(url),
        ])
    # Дублируем запись в файл обратной совместимости, если сохраняем live-матчи
    if output_csv == OUTPUT_LIVE_CSV and OUTPUT_LIVE_CSV_COMPAT:
        compat_exists = os.path.exists(OUTPUT_LIVE_CSV_COMPAT)
        try:
            with open(OUTPUT_LIVE_CSV_COMPAT, "a", newline="", encoding="utf-8") as f2:
                w2 = csv.writer(f2)
                if not compat_exists:
                    w2.writerow(["time", "favorite", "opponent", "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav",
                                 "nb3_fav_noH2H", "nb3_fav_H2H", "nb3_opp_noH2H", "nb3_opp_H2H",
                                 "last10_fav", "last10_opp", "h2h_total", "league", "url"])  # заголовки
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
                    (f"{nb3_fav_no:.1f}" if isinstance(nb3_fav_no, (int, float)) else ""),
                    (f"{nb3_fav_h2:.1f}" if isinstance(nb3_fav_h2, (int, float)) else ""),
                    (f"{nb3_opp_no:.1f}" if isinstance(nb3_opp_no, (int, float)) else ""),
                    (f"{nb3_opp_h2:.1f}" if isinstance(nb3_opp_h2, (int, float)) else ""),
                    (last10_fav or ""),
                    (last10_opp or ""),
                    (h2h_total or ""),
                    (league or ""),
                    _canonical_stats_url(url),
                ])
        except Exception as e:
            print(f"[save] warn: cannot write to {OUTPUT_LIVE_CSV_COMPAT}: {e}")


## extract_current_score удалён по запросу; формат CSV без счёта


def load_processed_urls(processed_path: str) -> Set[str]:
    # Режим "свежий запуск": игнорировать прошлые processed
    if os.getenv("AUTOBET_FRESH"):
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
        # Не очищаем результаты при повторных пересканах.
        # Файлы перезатираются ТОЛЬКО при запуске программы (см. run()).

        # 1) LIVE: текущая страница
        page.wait_for_timeout(800)
        try:
            expand_live_list(page)
        except Exception:
            pass
        try:
            links = collect_filtered_stats_links(page)
            print(f"[LIVE] Найдено страниц статистики после фильтра: {len(links)}")
        except Exception as e:
            print(f"[LIVE] Ошибка сбора матчей: {e}")
            links = []
        try:
            scan_and_save_stats(context, links, OUTPUT_LIVE_CSV, PROCESSED_LIVE_JSON, stop_event)
        except Exception as e:
            print(f"[LIVE] Ошибка обработки матчей: {e}")

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
                    up.evaluate(FILTER_JS % {"allowed": allowed_js})
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
