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
import json
import csv
from datetime import datetime
import argparse
from typing import List
import sys
import threading
import time

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
    _extract_metrics_for_csv,
    _extract_h2h_and_score,
    _extract_compare_block,
    _extract_league_name,
)


HERE = os.path.dirname(__file__)
OUTPUT_PREMA_CSV = os.path.join(HERE, "prema_3of3.csv")
PROCESSED_PREMA_JSON = os.path.join(HERE, "processed_prema_urls.json")

# Parse only these leagues (match by base words; city/country may vary)
ALLOWED_LEAGUES = [
    "Лига Про",   # matches: "Лига Про. Минск", "Лига Про. Чехия", etc.
    "Кубок ТТ",   # matches: "Кубок ТТ. Польша", "Кубок ТТ. Чехия", etc.
    "Сетка Кап",  # matches any variants following "Сетка Кап ..."
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
            print(f"[init] removed prema csv: {os.path.abspath(OUTPUT_PREMA_CSV)}")
    except Exception as e:
        print(f"[init] warn: cannot remove prema csv: {e}")
    try:
        if os.path.exists(PROCESSED_PREMA_JSON):
            os.remove(PROCESSED_PREMA_JSON)
            print(f"[init] removed processed prema: {os.path.abspath(PROCESSED_PREMA_JSON)}")
    except Exception as e:
        print(f"[init] warn: cannot remove processed prema: {e}")
    try:
        with open(OUTPUT_PREMA_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            # Синхронизируем формат с live CSV
            w.writerow([
                "time", "favorite", "opponent",
                "noBT3_noH2H", "noBT3_H2H", "logistic3_fav", "indexP3_fav",
                "nb3_fav_noH2H", "nb3_fav_H2H", "nb3_opp_noH2H", "nb3_opp_H2H",
                "last10_fav", "last10_opp", "h2h_total", "league", "url"
            ])
            try:
                f.flush(); os.fsync(f.fileno())
            except Exception:
                pass
        print(f"[init] created header at {os.path.abspath(OUTPUT_PREMA_CSV)}")
    except Exception as e:
        print(f"[init] error: cannot create header: {e}")


def run(filters: List[str]) -> int:
    args = build_arg_parser().parse_args()
    # Выбор набора лиг: либо все, либо фиксированный список
    filters = [] if getattr(args, "all_leagues", False) else ALLOWED_LEAGUES

    init_outputs()

    with sync_playwright() as p:
        ext_path = os.path.expanduser(args.extension_path) if args.extension_path else None

        # Persistent profile with extension (с защитой от зависшего SingletonLock)
        user_data_dir = os.path.join(HERE, ".chromium-profile")
        os.makedirs(user_data_dir, exist_ok=True)
        if ext_path and os.path.isdir(ext_path):
            print(f"[ext] loading extension from: {ext_path}")
        else:
            print(f"[ext] extension path not found or not a dir: {ext_path}")

        def _cleanup_profile_locks(path: str):
            for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
                try:
                    pth = os.path.join(path, name)
                    if os.path.exists(pth):
                        os.remove(pth)
                except Exception:
                    pass

        _cleanup_profile_locks(user_data_dir)

        context = None
        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir,
                headless=False,
                args=[
                    f"--disable-extensions-except={ext_path}",
                    f"--load-extension={ext_path}",
                ] if (ext_path and os.path.isdir(ext_path)) else None,
            )
        except Exception as e:
            # Фолбэк: создаём уникальный профиль для этого запуска
            alt_dir = os.path.join(HERE, f".chromium-profile-{int(time.time())}")
            try:
                os.makedirs(alt_dir, exist_ok=True)
            except Exception:
                pass
            print(f"[ext] warn: persistent profile in use, retry with {alt_dir}")
            context = p.chromium.launch_persistent_context(
                alt_dir,
                headless=False,
                args=[
                    f"--disable-extensions-except={ext_path}",
                    f"--load-extension={ext_path}",
                ] if (ext_path and os.path.isdir(ext_path)) else None,
            )
        page = context.new_page() if len(context.pages) == 0 else context.pages[0]
        root_page = page  # запомним базовую вкладку up-games

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

        # Если включён фильтр лиг — применим его через уже готовый FILTER_JS
        try:
            if filters:
                allowed_js = json.dumps(filters, ensure_ascii=False)
                page.evaluate(FILTER_JS % {"allowed": allowed_js})
        except Exception:
            pass

        # Быстро подтвердим cookies, если всплывёт попап
        for text in ("Принять", "Согласен", "Accept", "I Agree", "Я согласен"):
            try:
                page.locator(f"button:has-text(\"{text}\")").first.click(timeout=800)
            except Exception:
                pass

        # Дождаться появления блоков матчей или хотя бы стат-ссылок
        try:
            page.wait_for_selector("div.mb-4.simple-block.main-block.bg-white", timeout=6000)
        except Exception:
            try:
                page.wait_for_selector("a.stat-page[href*='/stats/?']", timeout=4000)
            except Exception:
                pass

        # Прокрутим, чтобы подгрузить больше блоков (как в live)
        try:
            expand_live_list(page)
        except Exception:
            pass
        page.wait_for_timeout(300)

        # Диагностика наличия блоков и ссылок
        try:
            nb = page.locator("div.mb-4.simple-block.main-block.bg-white").count()
            na = page.locator("a.stat-page[href*='/stats/?']").count()
            print(f"[debug] blocks={nb}, stat-anchors={na}")
        except Exception:
            pass

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

        # Позволяем пользователю в любой момент завершить работу по Enter
        stop_event = threading.Event()
        def _wait_for_enter():
            try:
                input()
            except Exception:
                pass
            stop_event.set()
        try:
            t = threading.Thread(target=_wait_for_enter, daemon=True)
            t.start()
            print("Нажмите Enter в консоли для немедленного завершения...")
        except Exception:
            pass

        processed = load_processed_urls(PROCESSED_PREMA_JSON)
        saved = 0
        visited = 0
        skipped_processed = 0
        # Открываем КАЖДУЮ страницу статистики в НОВОЙ вкладке, анализируем и СРАЗУ закрываем
        stats_tab = None  # не используется
        for url in links:
            if stop_event.is_set():
                print("[stop] Остановлено пользователем (Enter)")
                break
            print(f"[open] → {url}")
            if url in processed:
                skipped_processed += 1
                continue
            try:
                # Создаём новую вкладку и переходим по прямому URL
                active = context.new_page()
                active.goto(url, wait_until="domcontentloaded", timeout=15000)
                try:
                    active.bring_to_front()
                except Exception:
                    pass
                # Короткое ожидание сети, не задерживаем вкладку надолго
                try:
                    active.wait_for_load_state('networkidle', timeout=3000)
                except Exception:
                    pass
                try:
                    print(f"[open] at {active.url}")
                except Exception:
                    pass
                # Дождаться появления блока расширения с прогнозом (до 10 секунд)
                wait_for_decision_block(active, timeout_ms=10000)
                lp, rp = parse_players_from_stats_url(url)
                fav, opp, _, reason = extract_favorite_and_opponents(active, lp=lp, rp=rp)
                # Если не нашли условия с первого прохода — дадим ещё короткую паузу и попробуем снова
                if not reason:
                    try:
                        active.wait_for_timeout(1500)
                    except Exception:
                        pass
                    _, _, _, reason2 = extract_favorite_and_opponents(active, lp=lp, rp=rp)
                    if reason2:
                        reason = reason2

                # Жёсткий фолбэк: распарсим блок расширения напрямую из DOM
                if not reason:
                    try:
                        dec_text = active.evaluate(
                            """
                            () => {
                              const el = document.querySelector('.take-two-sets');
                              return el ? (el.innerText || '') : '';
                            }
                            """
                        ) or ""
                    except Exception:
                        dec_text = ""
                    if dec_text:
                        import re as _re
                        t = dec_text
                        # Извлекаем вердикт и совпадения
                        m_ver = _re.search(r"Решение\s*:\s*([^|\n\r]+)", t, _re.IGNORECASE)
                        verdict_raw = (m_ver.group(1).strip() if m_ver else '').upper()
                        is_go = 'GO' in verdict_raw
                        m_match = _re.search(r"Совпадений\s*:\s*(\d)\s*/\s*3\b", t, _re.IGNORECASE)
                        match_str = None
                        if m_match:
                            d = m_match.group(1)
                            if d in ('0','1','2','3'):
                                match_str = f"{d}/3"
                        # Всегда ставим PASS или GO
                        label = 'GO' if is_go else 'PASS'
                        reason = label if not match_str else f"{label} {match_str}"
                        # Попробуем вытащить фаворита
                        if not fav:
                            m_f = _re.search(r"Фаворит\s*:\s*([^\n\r]+)", t, _re.IGNORECASE)
                            if m_f:
                                fav = (m_f.group(1) or '').strip()
                # Если нашли решение, но не распознали игроков — попробуем простые фолбэки
                if reason and (not fav or not opp):
                    try:
                        names = active.evaluate(
                            """
                            () => {
                              const set = new Set();
                              const add = (s) => { if (s) { s = String(s).trim(); if (s && s.length >= 2 && s.length <= 40) set.add(s); } };
                              // Ссылки на игроков
                              document.querySelectorAll("a[href*='/players/']").forEach(a => add(a.textContent));
                              // Явные элементы имён
                              document.querySelectorAll(".player-name, .competitor .name, .competitor-name, .team .name, h1, h2").forEach(el => add(el.textContent));
                              const arr = Array.from(set).filter(Boolean);
                              // Возвращаем первые две строки
                              return arr.slice(0,2);
                            }
                            """
                        ) or []
                        if isinstance(names, list):
                            if not fav and len(names) >= 1:
                                fav = names[0]
                            if not opp and len(names) >= 2:
                                opp = names[1]
                    except Exception:
                        pass
                if reason and not fav:
                    fav = ""
                if reason and not opp:
                    opp = ""
                if fav is not None and opp is not None and reason:
                    # Извлекаем метрики и дополнительные данные под новый формат CSV
                    try:
                        metrics = _extract_metrics_for_csv(active, fav, opp)
                    except Exception:
                        metrics = (None, None, None, None)
                    # Ждём (по возможности) появления блоков с точками/таблицей
                    try:
                        active.wait_for_function(
                            "() => !!document.querySelector('.min2-compare')",
                            timeout=1200,
                        )
                    except Exception:
                        pass
                    try:
                        active.wait_for_function(
                            "() => !!document.querySelector('.min2-compare .cmp-row.last10 .fav.last10 .dot, .fav.last10 .dot')",
                            timeout=1800,
                        )
                    except Exception:
                        pass
                    try:
                        active.wait_for_function(
                            "() => !!document.querySelector('table.kmp_srt_results.main-table tbody tr.personal-meetings')",
                            timeout=1500,
                        )
                    except Exception:
                        pass
                    try:
                        active.wait_for_function(
                            "() => !!document.querySelector('.table-top .total, .total')",
                            timeout=1200,
                        )
                    except Exception:
                        pass
                    # Точки last10 и nb3
                    last10_fav = None
                    last10_opp = None
                    nb3_fav_no = nb3_fav_h2 = None
                    nb3_opp_no = nb3_opp_h2 = None
                    h2h_total = None
                    try:
                        hs = _extract_h2h_and_score(active, fav, opp) or {}
                        last10_fav = hs.get('favDots') or None
                        last10_opp = hs.get('oppDots') or None
                        h2h_total = hs.get('score') or None
                    except Exception:
                        pass
                    try:
                        cmp = _extract_compare_block(active)
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
                        if not last10_fav:
                            last10_fav = ((cmp.get('last10') or {}).get('favDots')) or last10_fav
                        if not last10_opp:
                            last10_opp = ((cmp.get('last10') or {}).get('oppDots')) or last10_opp
                        if not h2h_total:
                            h2h_total = cmp.get('h2hScore') or h2h_total

                    league = _extract_league_name(active)
                    save_match_row(
                        url, fav, opp, metrics, OUTPUT_PREMA_CSV,
                        last10_fav=last10_fav, last10_opp=last10_opp,
                        nb3_fav_no=nb3_fav_no, nb3_fav_h2=nb3_fav_h2,
                        nb3_opp_no=nb3_opp_no, nb3_opp_h2=nb3_opp_h2,
                        h2h_total=h2h_total,
                        league=league,
                    )
                    processed.add(url)
                    saved += 1
                    print(f"[saved:{reason}] {fav} vs {opp}")
                else:
                    # Отладка: выведем фрагмент блока/страницы, чтобы понять, что увидели
                    if os.getenv("AUTOBET_DEBUG"):
                        try:
                            blk = active.locator('.take-two-sets').first
                            txt = blk.inner_text(timeout=500) if blk.count() > 0 and blk.is_visible(timeout=200) else active.locator('body').inner_text(timeout=800)
                            import re as _re
                            snippet = _re.sub(r"\s+", " ", txt)[:220]
                            print(f"[debug] no-save snippet: {snippet}")
                        except Exception:
                            pass
            except Exception as e:
                print(f"[error] {url}: {e}")
            finally:
                # Закрываем активную вкладку и любые случайно оставшиеся вкладки кроме корневой (без задержки)
                try:
                    if 'active' in locals() and active:
                        try:
                            if hasattr(active, 'is_closed'):
                                if not active.is_closed():
                                    active.close()
                            else:
                                active.close()
                            print("[close] stats tab closed")
                        except Exception:
                            pass
                    # Перестраховка: закрыть все дополнительные вкладки, кроме root_page
                    try:
                        for p2 in list(context.pages):
                            if p2 is root_page:
                                continue
                            try:
                                if hasattr(p2, 'is_closed') and p2.is_closed():
                                    continue
                                p2.close()
                            except Exception:
                                continue
                    except Exception:
                        pass
                except Exception:
                    pass
            visited += 1

        save_processed_urls(processed, PROCESSED_PREMA_JSON)
        print(f"Итог: собрано ссылок={len(links)}, открыто={visited}, сохранено={saved}, пропущено как processed={skipped_processed}")

        return 0


# ----------------------- helpers (upcoming) -----------------------

def collect_filtered_stats_links_upcoming(page, allowed_filters: List[str]) -> List[str]:
    """Идём по каждому блоку up-games и берём ссылку на статистику.

    Сначала пробуем собрать всё в один проход через evaluate (быстрее и надёжнее),
    затем резервный вариант — через Locator-итерацию. Порядок сохранён как в DOM.
    """
    base = "https://tennis-score.pro"
    allowed = [s for s in (allowed_filters or []) if isinstance(s, str) and s.strip()]
    allowed_low = [s.lower() for s in allowed]

    hrefs: List[str] = []
    seen = set()

    # Попытка 1: собрать в JS все пары (href, text) по блокам
    try:
        items = page.evaluate(
            """
            () => {
              const base = location.origin;
              const out = [];
              const blocks = Array.from(document.querySelectorAll('div.mb-4.simple-block.main-block.bg-white'));
              for (const blk of blocks) {
                if (!blk || blk.classList.contains('__auto-filter-hidden__') || blk.closest('.__auto-filter-hidden__')) continue;
                const a = blk.querySelector("a.stat-page[href*='/stats/?']");
                if (!a) continue;
                const href = a.getAttribute('href') || '';
                if (!href || href.startsWith('#')) continue;
                const abs = new URL(href, base).href;
                const txt = (blk.innerText || blk.textContent || '').toLowerCase();
                out.push([abs, txt]);
              }
              return out;
            }
            """
        ) or []
        for abs_url, txt in items:
            if allowed_low and not any(s in txt for s in allowed_low):
                continue
            if abs_url not in seen:
                hrefs.append(abs_url)
                seen.add(abs_url)
    except Exception:
        pass

    # Попытка 2: через Locator (если JS не дал результата)
    if not hrefs:
        blocks = page.locator("div.mb-4.simple-block.main-block.bg-white")
        total_blocks = 0
        try:
            total_blocks = blocks.count()
        except Exception:
            total_blocks = 0
        for i in range(total_blocks):
            blk = blocks.nth(i)
            try:
                hidden = blk.evaluate("el => !!el.closest('.__auto-filter-hidden__') || el.classList.contains('__auto-filter-hidden__')")
                if hidden:
                    continue
                # Фильтрация по лигам, если включена
                if allowed_low:
                    txt = blk.evaluate("el => (el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase()") or ""
                    if not any(s in txt for s in allowed_low):
                        continue
                a = blk.locator("a.stat-page.tag[href*='/stats/?'], a.stat-page[href*='/stats/?']").first
                if a.count() == 0:
                    continue
                href = a.get_attribute("href") or ""
                if not href or href.startswith('#'):
                    continue
                abs_url = __import__('urllib.parse').urljoin(base, href)
                if abs_url not in seen:
                    hrefs.append(abs_url)
                    seen.add(abs_url)
            except Exception:
                continue

    # Фолбэк 3: общий поиск по якорям
    if not hrefs:
        try:
            anchors = page.locator("a.stat-page[href*='/stats/?']")
            count = anchors.count()
            for j in range(count):
                a = anchors.nth(j)
                try:
                    hidden = a.evaluate("el => !!el.closest('.__auto-filter-hidden__')")
                    if hidden:
                        continue
                    href = a.get_attribute("href") or ""
                    if not href or href.startswith('#'):
                        continue
                    txt = a.evaluate("el => (el.closest('.mb-4.simple-block.main-block.bg-white') || el.closest('[role=row]') || el.closest('.row') || el).innerText.toLowerCase()") or ""
                    if allowed_low and not any(s in txt for s in allowed_low):
                        continue
                    abs_url = __import__('urllib.parse').urljoin(base, href)
                    if abs_url not in seen:
                        hrefs.append(abs_url)
                        seen.add(abs_url)
                except Exception:
                    continue
        except Exception:
            pass

    return hrefs


if __name__ == "__main__":
    raise SystemExit(run([]))
