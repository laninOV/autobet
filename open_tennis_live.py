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
from urllib.parse import urljoin, urlparse, parse_qs
from typing import List, Optional, Tuple, Set
import threading

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

# Временно выключаем парсинг up-games (PREMATCH)
PARSE_UPCOMING = False

DEFAULT_FILTERS = [
    "Лига Про. Чехия",
    "Лига Про. Минск",
    "Лига Про",
    "Кубок ТТ. Польша",
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
    """Hard-reset output files and create fresh CSV with header."""
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
            csv.writer(f).writerow(["timestamp", "favorite", "opponent", "reason", "url"])
        print(f"[init] created header at {OUTPUT_LIVE_CSV}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV}: {e}")
    # инициализируем файл совместимости тем же заголовком
    try:
        with open(OUTPUT_LIVE_CSV_COMPAT, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "favorite", "opponent", "reason", "url"])
        print(f"[init] created header at {OUTPUT_LIVE_CSV_COMPAT}")
    except Exception as e:
        print(f"[init] error: cannot create {OUTPUT_LIVE_CSV_COMPAT}: {e}")


def run(filters: List[str]) -> None:
    from playwright.sync_api import sync_playwright

    args = parse_args_for_runtime()

    # Гарантированно очищаем файлы результатов перед запуском браузера
    _init_output_files()

    with sync_playwright() as p:
        ext_path = os.path.expanduser(args.extension_path) if hasattr(args, "extension_path") and args.extension_path else None

        context = None
        page = None

        if ext_path and os.path.isdir(ext_path):
            # Use persistent context to load extension
            user_data_dir = os.path.join(os.path.dirname(__file__), ".chromium-profile")
            os.makedirs(user_data_dir, exist_ok=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir,
                headless=False,
                args=[
                    f"--disable-extensions-except={ext_path}",
                    f"--load-extension={ext_path}",
                ],
            )
            page = context.new_page() if len(context.pages) == 0 else context.pages[0]
        else:
            # Regular non-persistent context (no extension)
            browser = p.chromium.launch(headless=False)
            storage = AUTH_STATE_PATH if os.path.exists(AUTH_STATE_PATH) else None
            context = browser.new_context(storage_state=storage)
            page = context.new_page()

        page.goto(URL, wait_until="domcontentloaded")

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
        def _restart_from_ui():
            # ВАЖНО: Playwright sync API не потокобезопасен —
            # выполняем restart_scan в том же потоке, что и контекст/страница
            try:
                restart_scan(context, page, filters)
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
            restart_scan(context, page, filters)
        except Exception as e:
            print(f"[scan] Ошибка первого прогона: {e}")

        # Переход на fon.bet временно отключён по запросу

        # Keep the browser open for user interaction
        page.wait_for_timeout(3600_000)  # 1 hour, Ctrl+C to exit


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
    parser.add_argument("--fonbet-login", dest="fonbet_login", help="Логин (email/телефон) для fon.bet (или FONBET_LOGIN)")
    parser.add_argument("--fonbet-password", dest="fonbet_password", help="Пароль для fon.bet (или FONBET_PASSWORD)")
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
    base = "https://tennis-score.pro"
    # Собираем видимые ссылки на страницу статистики из отфильтрованных строк
    hrefs = set()
    anchors = page.locator("a[href*='/stats/?']")
    count = anchors.count()
    for i in range(count):
        a = anchors.nth(i)
        try:
            # пропустим элементы внутри скрытых строк фильтра
            hidden = a.evaluate("el => !!el.closest('.__auto-filter-hidden__')")
            if hidden:
                continue
            href = a.get_attribute("href") or ""
            if not href or href.startswith("#"):
                continue
            abs_url = urljoin(base, href)
            hrefs.add(abs_url)
        except Exception:
            continue
    return list(hrefs)


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


def scan_and_save_stats(context, links: List[str], output_csv: str, processed_path: str) -> None:
    processed = load_processed_urls(processed_path)
    skipped_processed = 0
    visited = 0
    saved = 0
    for url in links:
        if url in processed:
            skipped_processed += 1
            if os.getenv("AUTOBET_DEBUG"):
                print(f"[skip:processed] {url}")
            continue
        try:
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            try:
                page.bring_to_front()
            except Exception:
                pass

            # Дожидаемся (до 1 секунды), пока расширение отрисует блок (GO/3/3/2/3)
            wait_for_decision_block(page, timeout_ms=1000)
            lp, rp = parse_players_from_stats_url(url)
            fav, opp, _, reason = extract_favorite_and_opponents(page, lp=lp, rp=rp)
            if fav and opp and reason:
                # время в формате HH:MM после GO/2/3/3/3
                hhmm = datetime.now().strftime("%H:%M")
                reason_with_time = f"{reason}, {hhmm}"
                save_match_row(url, fav, opp, reason_with_time, output_csv)
                processed.add(url)
                print(f"[saved:{reason}] {fav} vs {opp} ({url})")
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


def save_match_row(url: str, favorite: str, opponent: str, reason: Optional[str], output_csv: str) -> None:
    exists = os.path.exists(output_csv)
    with open(output_csv, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if not exists:
            w.writerow(["timestamp", "favorite", "opponent", "reason", "url"])  # заголовки
        w.writerow([datetime.now().isoformat(timespec="seconds"), favorite, opponent, reason or "", url])
    # Дублируем запись в файл обратной совместимости, если сохраняем live-матчи
    if output_csv == OUTPUT_LIVE_CSV and OUTPUT_LIVE_CSV_COMPAT:
        compat_exists = os.path.exists(OUTPUT_LIVE_CSV_COMPAT)
        try:
            with open(OUTPUT_LIVE_CSV_COMPAT, "a", newline="", encoding="utf-8") as f2:
                w2 = csv.writer(f2)
                if not compat_exists:
                    w2.writerow(["timestamp", "favorite", "opponent", "reason", "url"])  # заголовки
                w2.writerow([datetime.now().isoformat(timespec="seconds"), favorite, opponent, reason or "", url])
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


def restart_scan(context, page, filters: Optional[List[str]] = None) -> None:
    if not _SCAN_LOCK.acquire(blocking=False):
        print("[restart] Уже идёт сканирование — пропускаю запрос")
        return
    try:
        # Всегда очищаем результаты и историю processed перед каждым запуском
        _init_output_files()

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
            scan_and_save_stats(context, links, OUTPUT_LIVE_CSV, PROCESSED_LIVE_JSON)
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
                    scan_and_save_stats(context, links2, OUTPUT_PREMA_CSV, PROCESSED_PREMA_JSON)
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
