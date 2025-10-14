#!/usr/bin/env python3
"""
Scan upcoming matches page https://tennis-score.pro/up-games/ using the
same extension-driven signals (GO / 3/3 / 2/3) and save suitable
matches into prema_3of3.csv. Uses a persistent Chromium profile and
loads the local extension from this repo by default.

Usage:
  python3 open_tennis_upcoming.py
  python3 open_tennis_upcoming.py "Лига Про" "Кубок ТТ. Польша"
  python3 open_tennis_upcoming.py --email you@example.com --password secret

Notes:
  - Writes/overwrites prema_3of3.csv on each run.
  - Maintains processed_prema_urls.json to skip already-processed links.
"""

import os
import csv
from datetime import datetime
import argparse
from typing import List

from playwright.sync_api import sync_playwright

# Reuse helpers and constants from live scanner
from open_tennis_live import (
    URL_UPCOMING,
    FILTER_JS,
    DEFAULT_EXTENSION_PATH,
    ensure_login,
    expand_live_list,
    wait_for_decision_block,
    parse_players_from_stats_url,
    extract_favorite_and_opponents,
    load_processed_urls,
    save_processed_urls,
    save_match_row,
)


HERE = os.path.dirname(__file__)
OUTPUT_PREMA_CSV = os.path.join(HERE, "prema_3of3.csv")
PROCESSED_PREMA_JSON = os.path.join(HERE, "processed_prema_urls.json")

# Parse only these leagues
ALLOWED_LEAGUES = [
    "Лига Про. Чехия",
    "Лига Про. Минск",
    "Лига Про",
    "Кубок ТТ. Польша",
]

# Small helper JS to count visible allowed matches and to limit visible rows to N
COUNT_ALLOWED_JS = r"""
(() => {
  const anchors = Array.from(document.querySelectorAll('a.stat-page.tag[href*="/stats/?"]'));
  let rows = [];
  for (const a of anchors) {
    // skip hidden by league filter
    if (a.closest('.__auto-filter-hidden__')) continue;
    const row = a.closest('.row') || a.closest('[role="row"]') || a.closest('li') || a.closest('tr') || a.closest('.match') || a;
    if (row && !rows.includes(row)) rows.push(row);
  }
  return rows.length;
})()
"""

COUNT_ALL_STAT_ANCHORS_JS = r"""
(() => document.querySelectorAll('a.stat-page.tag[href*="/stats/?"]').length)()
"""

LIMIT_TO_N_JS = r"""
((N) => {
  try {
    const styleId = '__auto_limit_style__';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.textContent = '.__auto-limit-hidden__{display:none!important}';
      document.documentElement.appendChild(s);
    }
    const anchors = Array.from(document.querySelectorAll('a.stat-page.tag[href*="/stats/?"]'));
    const rows = [];
    for (const a of anchors) {
      if (a.closest('.__auto-filter-hidden__')) continue;
      const row = a.closest('.row') || a.closest('[role="row"]') || a.closest('li') || a.closest('tr') || a.closest('.match') || a;
      if (row && !rows.includes(row)) rows.push(row);
    }
    rows.forEach((row, i) => row.classList.toggle('__auto-limit-hidden__', i >= N));
    return { total: rows.length, limitedTo: N };
  } catch (e) { return { error: String(e) }; }
})(%d)
"""


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Scan upcoming matches (up-games) and save suitable matches")
    # Filters are fixed to ALLOWED_LEAGUES; keep arg for compatibility but ignore it
    p.add_argument("filters", nargs="*", help="(ignored) Фильтры лиг; используются фиксированные ALLOWED_LEAGUES")
    p.add_argument("--email", dest="email", help="Email для авторизации (иначе TENNIS_EMAIL или значение по умолчанию)")
    p.add_argument("--password", dest="password", help="Пароль для авторизации (иначе TENNIS_PASSWORD или значение по умолчанию)")
    p.add_argument(
        "--extension-path",
        dest="extension_path",
        default=DEFAULT_EXTENSION_PATH,
        help="Путь к Chrome-расширению (будет загружено в persistent-профиль)",
    )
    p.add_argument(
        "--all-leagues",
        dest="all_leagues",
        action="store_true",
        default=True,
        help="Игнорировать фильтр лиг и просматривать ВСЕ матчи на up-games (по умолчанию включено)",
    )
    p.add_argument(
        "--stats",
        dest="stats_urls",
        nargs="*",
        help="Не собирать с up-games, а сразу открыть указанные ссылки /stats (абсолютные или относительные)",
    )
    return p


def init_outputs():
    # Reset files and create header
    try:
        if os.path.exists(OUTPUT_PREMA_CSV):
            os.remove(OUTPUT_PREMA_CSV)
            print(f"[init] removed prema csv: {OUTPUT_PREMA_CSV}")
    except Exception as e:
        print(f"[init] warn: cannot remove prema csv: {e}")
    try:
        if os.path.exists(PROCESSED_PREMA_JSON):
            os.remove(PROCESSED_PREMA_JSON)
            print(f"[init] removed processed prema: {PROCESSED_PREMA_JSON}")
    except Exception as e:
        print(f"[init] warn: cannot remove processed prema: {e}")
    try:
        with open(OUTPUT_PREMA_CSV, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "favorite", "opponent", "reason", "url"])
        print(f"[init] created header at {OUTPUT_PREMA_CSV}")
    except Exception as e:
        print(f"[init] error: cannot create header: {e}")


def run(filters: List[str]) -> int:
    args = build_arg_parser().parse_args()
    # Выбор набора лиг: либо все, либо фиксированный список
    filters = [] if getattr(args, "all_leagues", False) else ALLOWED_LEAGUES

    init_outputs()

    with sync_playwright() as p:
        ext_path = os.path.expanduser(args.extension_path) if args.extension_path else None

        # Persistent profile with extension
        user_data_dir = os.path.join(HERE, ".chromium-profile")
        os.makedirs(user_data_dir, exist_ok=True)
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            args=[
                f"--disable-extensions-except={ext_path}",
                f"--load-extension={ext_path}",
            ] if (ext_path and os.path.isdir(ext_path)) else None,
        )
        page = context.new_page() if len(context.pages) == 0 else context.pages[0]

        email = args.email or os.getenv("TENNIS_EMAIL") or "barbosa197223@gmail.com"
        password = args.password or os.getenv("TENNIS_PASSWORD") or "FiksA732528"

        print("[nav] goto up-games")
        page.goto(URL_UPCOMING, wait_until="domcontentloaded")
        if not ensure_login(context, page, email, password):
            print("[login] Предупреждение: не удалось войти. Продолжаю без авторизации.")
        # ensure we are on up-games after login helper (it may redirect to live)
        try:
            print("[nav] ensure up-games after login")
            page.goto(URL_UPCOMING, wait_until="domcontentloaded")
        except Exception:
            pass
        # Явно дождаться появления хотя бы одной stat-ссылки в DOM
        try:
            page.wait_for_selector("a.stat-page[href*='/stats/?']", timeout=7000)
        except Exception:
            pass
        try:
            vis_count = page.locator("a.stat-page[href*='/stats/?']").count()
            print(f"[debug] visible stat anchors: {vis_count}")
        except Exception:
            print("[debug] visible stat anchors: n/a")

        # Ничего не прокручиваем: работаем только с тем, что уже загружено в DOM.
        page.wait_for_timeout(300)

        # Collect links
        links: List[str] = []
        if args.stats_urls:
            base = "https://tennis-score.pro"
            seen = set()
            for u in args.stats_urls:
                u = (u or "").strip()
                if not u:
                    continue
                if u.startswith("/"):
                    u = __import__("urllib.parse").urljoin(base, u)
                if not u.startswith("http"):
                    # allow users to paste only query string like ?alp=..&arp=..
                    if u.startswith("?"):
                        u = base + "/stats/" + u
                    else:
                        u = base + "/stats/?" + u
                if u not in seen:
                    links.append(u)
                    seen.add(u)
            print(f"[DIRECT] Принято ссылок для обработки: {len(links)}")
        else:
            # Collect and scan (apply robust textual filter by tournament/league)
            try:
                links = collect_filtered_stats_links_upcoming(page, filters)
                if not links and filters:
                    # Фолбэк: если по фильтрам ничего не нашли — соберём все
                    links = collect_filtered_stats_links_upcoming(page, [])
                print(f"[UPCOMING] Найдено страниц статистики: {len(links)}")
                for i, u in enumerate(links[:10]):
                    print(f"  [link {i+1}] {u}")
            except Exception as e:
                print(f"[UPCOMING] Ошибка сбора матчей: {e}")
                links = []

        processed = load_processed_urls(PROCESSED_PREMA_JSON)
        saved = 0
        visited = 0
        skipped_processed = 0
        # Открываем КАЖДУЮ страницу статистики в НОВОЙ вкладке и не закрываем её
        stats_tab = None  # не используется в этом режиме, оставлено на случай возврата к reuse
        for url in links:
            print(f"[open] → {url}")
            if url in processed:
                skipped_processed += 1
                continue
            try:
                # Создаём новую вкладку и переходим по прямому URL
                active = context.new_page()
                active.goto(url, wait_until="domcontentloaded", timeout=25000)
                try:
                    active.bring_to_front()
                except Exception:
                    pass
                try:
                    active.wait_for_load_state('networkidle', timeout=15000)
                except Exception:
                    pass
                try:
                    print(f"[open] at {active.url}")
                except Exception:
                    pass
                # Дождаться появления блока расширения с прогнозом
                wait_for_decision_block(active, timeout_ms=6000)
                lp, rp = parse_players_from_stats_url(url)
                fav, opp, _, reason = extract_favorite_and_opponents(active, lp=lp, rp=rp)
                if fav and opp and reason:
                    hhmm = datetime.now().strftime("%H:%M")
                    save_match_row(url, fav, opp, f"{reason}, {hhmm}", OUTPUT_PREMA_CSV)
                    processed.add(url)
                    saved += 1
                    print(f"[saved:{reason}] {fav} vs {opp}")
                # Небольшая пауза между переходами
                try:
                    active.wait_for_timeout(300)
                except Exception:
                    pass
            except Exception as e:
                print(f"[error] {url}: {e}")
            visited += 1

        save_processed_urls(processed, PROCESSED_PREMA_JSON)
        print(f"Итог: собрано ссылок={len(links)}, открыто={visited}, сохранено={saved}, пропущено как processed={skipped_processed}")

        # Оставляем страницы открытыми для ручного просмотра
        try:
            print("Просмотр окон открыт. Нажмите Enter для завершения...")
            input()
        except KeyboardInterrupt:
            pass
        return 0


if __name__ == "__main__":
    raise SystemExit(run([]))


# ----------------------- helpers (upcoming) -----------------------

def collect_filtered_stats_links_upcoming(page, allowed_filters: List[str]) -> List[str]:
    """Collect stats links from up-games page that belong to allowed tournaments.
    Uses DOM text around the link to ensure it matches one of allowed_filters.
    """
    base = "https://tennis-score.pro"
    # Normalize allowed filters
    allowed = [s for s in (allowed_filters or []) if isinstance(s, str) and s.strip()]
    allowed_low = [s.lower() for s in allowed]

    hrefs = []
    seen = set()
    # На up-games целевая ссылка имеет класс .stat-page (класс .tag может отсутствовать)
    anchors = page.locator("a.stat-page[href*='/stats/?']")
    count = anchors.count()
    for i in range(count):
        a = anchors.nth(i)
        try:
            # skip filtered-out rows (league filter only). Do NOT skip limit-hidden: we scan all matches.
            hidden = a.evaluate("el => !!el.closest('.__auto-filter-hidden__')")
            if hidden:
                continue
            href = a.get_attribute("href") or ""
            if not href or href.startswith("#"):
                continue
            # Extract surrounding row text to match tournament name
            txt = a.evaluate(
                "el => {\n"
                "  function textOf(node){ return (node && (node.innerText||node.textContent)||'').replace(/\\s+/g,' ').trim(); }\n"
                "  const isRow = n => {\n"
                "    if (!n || n.nodeType !== 1) return false;\n"
                "    const c = n.className ? String(n.className) : '';\n"
                "    return n.getAttribute('role')==='row' || /\\b(row|match|event|list|table|card)\\b/i.test(c);\n"
                "  };\n"
                "  let p = el; let hops = 0;\n"
                "  while (p && hops < 8) { p = p.parentElement; if (!p) break; if (isRow(p)) return textOf(p); hops++; }\n"
                "  return textOf(el.closest('[role=\"row\"]') || el.closest('.row') || el.closest('tr') || el.closest('li') || el.closest('.match') || el.closest('.event') || el);\n"
                "}"
            ) or ""
            m = txt.lower()
            if allowed_low and not any(s in m for s in allowed_low):
                continue
            abs_url = __import__('urllib.parse').urljoin(base, href)
            if abs_url not in seen:
                hrefs.append(abs_url)
                seen.add(abs_url)
        except Exception:
            continue
    return hrefs
