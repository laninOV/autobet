/*
Вот улучшенный, чётко структурированный и выразительный вариант вывода — с акцентом на самые сильные показатели победителя и ясной иерархией значимости 👇

---

## 🧩 Анализ закономерностей из документа «Мдааа.txt»

В документе собраны десятки матчей с итогами (3:1, 0:3 и т.д.)
и показателем «Совпадения: X/6» — где X отражает количество выполненных условий из модели.

Цель — определить, какие параметры чаще всего сопровождают победителя.

---

### 📊 Что чаще совпадает с победителем

| Показатель                          | Частота совпадения при победителе          | Значимость         |
| ----------------------------------- | ------------------------------------------ | ------------------ |
| ✅ Модель ≥ 50%                      | ~100% — выполняется практически всегда     | 🔥 Критический     |
| ✅ Форма (3 игры) ≥ 15%              | ~95% случаев                               | 🔥 Ключевой        |
| ✅ Вероятность (3, без BT) > 15%     | ~90–95% случаев                            | 🔥 Ключевой        |
| ✅ Логистическая (3 игры) > 15%      | ~80–85% случаев                            | ⚡ Сильный         |
| ✅ Δ(5−10) ≥ −2% и Δ(3−5) ≥ 0%       | ~40–45% случаев                            | ⚠️ Слабый          |
| ✅ Уверенность ≥ 60%                 | ~30–40% случаев                            | ⚠️ Почти не влияет |

---

### 🧠 Типичный паттерн победителя

• Совпадений 4 и более из 6
• Главный сигнал — актуальная форма и перевес по окну 3 игры
• Даже при отрицательном тренде (Δ) или низкой уверенности (<60%) фаворит часто побеждает, если форма и краткосрочные вероятности сильны
• Проигрывают чаще те фавориты, у которых нет преимущества именно по последним 3 играм

---

### 🎯 Практические выводы

Главные индикаторы победы (в порядке значимости):
1) Модель ≥ 50% — базовое условие (фаворит по прогнозу)
2) Превосходство ≥ 15% по форме (3 игры) — отражает актуальную динамику
3) Превосходство ≥ 15% по «без BT (3 игры)» — подтверждает устойчивость
4) Превосходство ≥ 15% по логистической модели (3 игры) — усиливает уверенность в исходе

Дополнительные, но не ключевые:
• Δ(5−10), Δ(3−5) — не показатель победы, часто отрицательные даже при выигрыше
• Уверенность модели — низкая корреляция с результатом, больше шумовой фактор

---

### 🧩 Итог

Победитель почти всегда имеет:
• 4+ совпадений из 6
• Ярко выраженный перевес в последних 3 играх
• Поддержку по всем коротким окнам (форма, без BT, логистика)

Даже при слабом тренде и низкой уверенности фаворит побеждает,
если у него высокие показатели по короткой форме (3 игры).

---

Промт для блока анализа совпадений с победителем — компактный, с объяснением логики и критериев. Его можно вставить прямо в код расширения (или использовать в Python/JS-обработке данных).

```txt
[ПРОМТ: Анализ совпадений и победителя]

Цель блока:
Определить, насколько часто выполнение условий (1–6) из Decision Summary коррелирует с фактической победой фаворита.

Входные данные (на матч):
- fav_name / opp_name
- score / winner ("fav" или "opp")
- matches.conditions_met (1–6)
- fav_deltas: Δ(5−10), Δ(3−5)
- fav_form_p3, opp_form_p3
- fav_prob_p3, opp_prob_p3 (без BT)
- ml_fav_p3, ml_opp_p3
- confidence

Логика анализа:
1️⃣ Определяем победителя:
   - Если score указывает, что выиграл фаворит → winner = fav.
   - Иначе → winner = opp.

2️⃣ Проверяем выполнение условий Decision Summary (1–6):
   - Модель ≥ 50%
   - Δ(5−10) ≥ −2% и Δ(3−5) ≥ 0%
   - (Форма p₃_fav − p₃_opp) ≥ 15%
   - (Без BT p₃_fav − p₃_opp) ≥ 15%
   - (Логистическая p₃_fav − p₃_opp) ≥ 15%
   - Уверенность ≥ 60%

3️⃣ Считаем совпадения (conditions_met = количество «зелёных» условий).

4️⃣ Сравниваем с исходом:
   - Если winner == fav → победа фаворита (true)
   - Иначе → поражение фаворита (false)

5️⃣ Собираем статистику:
   - Общее количество матчей
   - Среднее количество совпадений у победителя
   - Частота побед при:
       • ≥4 совпадениях
       • ≥5 совпадениях
       • <3 совпадениях
   - Какие условия чаще выполняются у победителя

6️⃣ Формат вывода (в консоль / блоке UI):
------------------------------------------------
🏓 Анализ по последним матчам:
Всего матчей: 28
Побед фаворитов: 19 (68%)
Среднее совпадений у победителей: 4.5 из 6
Порог надёжности: ≥4 совпадений → 81% побед
Топ-факторы победителя:
✅ Форма (3 игры) — 95%
✅ Без BT (3 игры) — 92%
✅ Логистическая (3 игры) — 85%
⚠️ Δ-показатели — слабая корреляция (≈45%)
⚠️ Уверенность — не критична (<40%)
------------------------------------------------

7️⃣ Вывод:
Если у фаворита ≥4 совпадения и перевес по форме (3 игры) >15% — вероятность победы ≈80%.
```
*/

// --- Enhanced Decision Summary Renderer ---
function renderDecisionSummary(match) {
  const fav = match?.fav || {};
  const opp = match?.opp || {};
  const ml = match?.ml || {};
  const form = match?.form || {};
  const baseProb = Number(match?.baseProb ?? match?.base_eval ?? NaN);
  const confidence = Number(match?.confidence ?? NaN);

  const d5_10 = Number(fav?.d5_10 ?? NaN);
  const d3_5 = Number(fav?.d3_5 ?? NaN);
  const formDiff = Number((form?.p3Fav ?? NaN) - (form?.p3Opp ?? NaN));
  const noBt3Diff = Number((fav?.p3 ?? NaN) - (opp?.p3 ?? NaN));
  const ml3Diff = Number((ml?.pFav3 ?? NaN) - (ml?.pOpp3 ?? NaN));
  const mlFav3 = Number(ml?.pFav3 ?? NaN);

  const ok = (v) => Number.isFinite(v);
  const signPct = (v, d=0) => ok(v) ? `${v>0?'+':''}${v.toFixed(d)}%` : '—';
  const fmtPct = (v, d=0) => ok(v) ? `${v.toFixed(d)}%` : '—';
  const arrow = (v) => ok(v) ? (v > 0 ? '↑' : (v < 0 ? '↓' : '→')) : '—';

  const c1 = ok(baseProb) && baseProb >= 50;
  const c2 = ok(d5_10) && ok(d3_5) && d5_10 >= -2 && d3_5 >= 0;
  const c3 = ok(formDiff) && formDiff >= 15;
  const c4 = ok(noBt3Diff) && noBt3Diff >= 15;
  // Логистическая модель (3): обязательное условие — вероятность фаворита > 54%
  const c5 = ok(mlFav3) && mlFav3 > 54;
  const c6 = ok(confidence) && confidence >= 60;

  const checks = [c1, c2, c3, c4, c5, c6];
  const score = checks.filter(Boolean).length;
  const keyCount = [c3, c4, c5].filter(Boolean).length; // ключевые сигналы: форма(3), без BT(3), логистика(3)
  const idxRaw = 0.4 * (score / 6) + 0.6 * (keyCount / 3);
  const index = Math.max(0, Math.min(1, idxRaw));
  const indexPct = Math.round(100 * index);

  let verdict = '🟡 Осторожно — возможен апсет';
  let color = '#aa0';
  if (score >= 5 || index >= 0.75) { verdict = '🟢 Надёжно — высокая вероятность победы'; color = '#0a0'; }
  else if (score <= 2 || index < 0.45) { verdict = '🔴 Рисково — перевес слабый, фаворит уязвим'; color = '#a00'; }

  const idxBand = index >= 0.75 ? 'высокий' : (index < 0.45 ? 'низкий' : 'средний');
  const li = (ok, text) => `<li>${ok ? '✅' : '❌'} ${text}</li>`;

  const favName = match?.favName || 'Фаворит';
  const mustMlFav = ok(mlFav3) && mlFav3 > 54; // обязательное условие
  const failParts = [];
  if (!(ok(d5_10) && ok(d3_5) && d5_10 >= -2 && d3_5 >= 0)) {
    failParts.push(`Тренд без BT: Δ(5−10) ${ok(d5_10) ? signPct(d5_10) : '—'}; Δ(3−5) ${ok(d3_5) ? signPct(d3_5) : '—'}`);
  }
  if (!mustMlFav) {
    failParts.push(`Логистическая: Вероятность (3) ≤ 54% (fav ${ok(mlFav3) ? fmtPct(mlFav3) : '—'})`);
  }
  const items = [
    li(c1, `Модель подтверждает фаворита ≥50% ${ok(baseProb) ? `(${fmtPct(baseProb)})` : ''}`),
    li(c2, `Δ(5−10) ≥ −2% и Δ(3−5) ≥ 0% ${ok(d5_10)&&ok(d3_5) ? `(Δ5−10: ${signPct(d5_10)}, Δ3−5: ${signPct(d3_5)})` : ''}`),
    li(c3, `Форма (3) за фаворита ${ok(formDiff) ? signPct(formDiff) : ''}`),
    li(c4, `Без BT (3) перевес ${ok(noBt3Diff) ? signPct(noBt3Diff) : ''}`),
    li(c5, `Логистическая: Вероятность (3) ${ok(mlFav3) ? fmtPct(mlFav3) : ''} (>54% для выполнения)`),
    li(c6, `Уверенность ${ok(confidence) ? fmtPct(confidence) : ''}`)
  ].join('');

  const keySignals = [
    `форма(3) ${arrow(formDiff)}`,
    `без BT(3) ${arrow(noBt3Diff)}`,
    `логистическая(3) ${arrow(ml3Diff)}`
  ].join(', ');

  return `
    <div class="decision-summary"
         style="background:${color};color:#fff;padding:8px 12px;border-radius:10px;font:600 13px/1.3 system-ui;margin-bottom:8px;">
      <div style="font-size:14px;">🔎 Совпадения: ${score}/6 • Фаворит: ${favName}</div>
      <ul style="margin:6px 0 8px 16px;padding:0;font-weight:500;list-style: none;">
        ${items}
      </ul>
      ${failParts.length ? `<div style="margin-top:4px;">❌ Не выполнено: ${failParts.join('; ')}</div>` : ''}
      <div style="font-weight:600;">📈 Индекс уверенности: ${indexPct}% <span style="opacity:.9;font-weight:600;">(${idxBand})</span></div>
      <div style="margin-top:4px;">💬 Вердикт: ${verdict}</div>
      <div style="margin-top:4px;opacity:.95;">Ключевые сигналы: ${keySignals}</div>
    </div>
  `;
}

// --- "Возьмёт минимум 2 сета" Renderer ---
function renderMinTwoSets(match) {
  const fav = match?.fav || {};
  const opp = match?.opp || {};
  const ml = match?.ml || {};
  const form = match?.form || {};

  const ok = (v) => Number.isFinite(v);
  const signPct = (v, d=0) => ok(v) ? `${v>0?'+':''}${v.toFixed(d)}%` : '—';
  const fmtPct = (v, d=0) => ok(v) ? `${v.toFixed(d)}%` : '—';

  // Core 3-window signals
  const noBt3Diff = Number((fav?.p3 ?? NaN) - (opp?.p3 ?? NaN));
  const form3Diff = Number((form?.p3Fav ?? NaN) - (form?.p3Opp ?? NaN));
  const ml3Diff   = Number((ml?.pFav3 ?? NaN) - (ml?.pOpp3 ?? NaN));
  const mlFav3    = Number(ml?.pFav3 ?? NaN);

  const passNoBt3 = ok(noBt3Diff) && noBt3Diff >= 15;
  const passForm3 = ok(form3Diff) && form3Diff >= 15;
  // Логистическая (3): обязательна вероятность за фаворита >54%
  const passMl3   = ok(ml3Diff) && ml3Diff >= 15 && ok(mlFav3) && mlFav3 > 54; // строгий порог + обязательное условие
  const mlRed     = ok(ml3Diff)   ? (ml3Diff < 0) : false; // красная логистика

  // Background (10-game) context
  const p10Fav = Number(fav?.p10 ?? NaN);
  const p10Opp = Number(opp?.p10 ?? NaN);

  // Shock against favorite: opponent rising sharply or favorite dropping sharply
  const d5_10_opp = Number(opp?.d5_10 ?? NaN);
  const d5_10_fav = Number(fav?.d5_10 ?? NaN);
  const shockOpp = (ok(d5_10_opp) && d5_10_opp >= 15) || (ok(d5_10_fav) && d5_10_fav <= -15);

  const matched = [passNoBt3, passForm3, passMl3].filter(Boolean).length;

  let verdict = 'Осторожно';
  let color = '#aa0';
  // Обязательное условие для любого решения в пользу фаворита — Вероятность(3) > 54%
  const mustMlFav = ok(mlFav3) && mlFav3 > 54;
  if (!mustMlFav || shockOpp || matched <= 1) { verdict = 'PASS'; color = '#a00'; }
  else if (matched >= 2 && mlRed) { verdict = 'Осторожно'; color = '#aa0'; }
  else if (matched >= 2 && !mlRed) { verdict = 'GO'; color = '#0a0'; }

  const mlBadge = mlRed ? ' (красная)' : '';
  const favName = match?.favName || 'Фаворит';
  const header = `🔎 Решение: ${verdict}  • Фаворит: ${favName}`;
  const sub = `Совпадений по 3-окну: ${matched}/3`;
  const keys = `Ключи: БезBT(3) ${signPct(noBt3Diff)}, Форма(3) ${signPct(form3Diff)}, Логист.(3) ${signPct(ml3Diff)}${mlBadge}`;
  const bg = `Фон (10): ${fmtPct(p10Fav)} vs ${fmtPct(p10Opp)}` + (shockOpp ? ` • У оппа форм-шок Δ(5−10) ${signPct(d5_10_opp)}` : '');

  return `
    <div class="take-two-sets" style="background:${color};color:#fff;padding:8px 12px;border-radius:10px;font:600 13px/1.3 system-ui;margin:8px 0;">
      <div style="font-size:14px;">${header}</div>
      <div style="margin-top:2px;">${sub}</div>
      <div style="margin-top:2px;">${keys}</div>
      <div style="margin-top:2px;opacity:.95;font-weight:500;">${bg}</div>
    </div>
  `;
}

(() => {
  const BTN_ID = "tsx-copy-json-btn";

  // --------- Utilities ---------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const text = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const absHref = (a) => {
    if (!a) return null;
    try {
      const href = a.getAttribute("href") || a.href || "";
      if (!href) return null;
      return new URL(href, location.origin).href;
    } catch {
      return null;
    }
  };
  const getAttr = (el, names) => {
    if (!el) return null;
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v != null) return v;
    }
    return null;
  };

  const parseFinalScore = (str) => {
    if (!str) return null;
    const m = String(str).match(/(\d+)\s*:\s*(\d+)/);
    if (!m) return null;
    return { left: Number(m[1]), right: Number(m[2]) };
  };

  const parseSetsFromTooltip = (el) => {
    if (!el) return [];
    const rawAttr = getAttr(el, [
      "data-bs-original-title",
      "data-original-title",
      "title",
      "aria-label"
    ]);
    let raw = rawAttr || "";
    // Fallback to text content, many pages have inline text like: "3:2 (11:9 7:11 11:8 9:11 11:7)"
    if (!raw) {
      try { raw = el.textContent || ""; } catch(_) { raw = ""; }
    }
    if (!raw) return [];
    // Try capture inside parentheses first; otherwise use full string
    const inside = (String(raw).match(/\(([^)]+)\)/) || [])[1] || String(raw);
    const parts = inside
      .replace(/[\[\]]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const sets = [];
    for (const p of parts) {
      const mm = p.match(/(\d+)\s*[:\-]\s*(\d+)/);
      if (mm) sets.push([Number(mm[1]), Number(mm[2])]);
    }
    return sets;
  };

  // Fallback: parse per-set scores from the entire row text, e.g. "3:2 (11:9 7:11 11:8 9:11 11:7)"
  const parseSetsFromRowText = (row) => {
    try {
      if (!row) return [];
      const raw = String(row.innerText || row.textContent || '').trim();
      if (!raw) return [];
      const inside = (raw.match(/\(([^)]+)\)/) || [])[1];
      if (!inside) return [];
      const parts = inside.split(/\s+/).filter(Boolean);
      const out = [];
      for (const p of parts) {
        const m = p.match(/(\d+)\s*[:\-]\s*(\d+)/);
        if (m) out.push([Number(m[1]), Number(m[2])]);
      }
      return out;
    } catch { return []; }
  };

  const uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = keyFn(x);
      if (!k || !seen.has(k)) {
        if (k) seen.add(k);
        out.push(x);
      }
    }
    return out;
  };

  // Fallback extraction of per-set scores from set-td cells (if tooltip absent)
  const parseSetsFromCells = (row) => {
    const cells = $$("td.set-td", row);
    const nums = cells.map((c) => Number(text(c))).filter((n) => Number.isFinite(n));
    const sets = [];
    for (let i = 0; i + 1 < nums.length; i += 2) sets.push([nums[i], nums[i + 1]]);
    return sets;
  };

  // Determine if rival is left/right using URL slugs
  const deriveOwnIsLeft = (gameUrl, rivalPlayerUrl) => {
    try {
      if (!gameUrl || !rivalPlayerUrl) return null;
      const gp = new URL(gameUrl, location.origin);
      const rp = new URL(rivalPlayerUrl, location.origin);
      // Rival slug from /players/<slug>-<id>/
      const rivalMatch = rp.pathname.match(/\/players\/([^/]+)-\d+\/?$/);
      const rivalSlug = rivalMatch ? rivalMatch[1] : null;

      // Game path: /games/<slug1>-<slug2>-<id>/ (sometimes site duplicates slugs; handle safely)
      const gMatch = gp.pathname.match(/\/games\/([^/]+)-([^/]+)-(\d+)\/?$/);
      if (gMatch) {
        const slug1 = gMatch[1];
        const slug2 = gMatch[2];
        if (rivalSlug) {
          if (slug1 === rivalSlug && slug2 !== rivalSlug) return false; // rival left => own right
          if (slug2 === rivalSlug && slug1 !== rivalSlug) return true;  // rival right => own left
          if (slug1 === rivalSlug && slug2 === rivalSlug) {
            // pathological duplicate: can't infer
            return null;
          }
        }
        // If no rival slug match, but two distinct slugs exist, we can't decide reliably
        return null;
      }

      // Fallback to previous heuristic using segment scanning
      let segment = gp.pathname.replace(/^\/?games\//, "");
      segment = segment.replace(/-\d+\/?$/, "");
      if (rivalSlug) {
        const rivalLeft = segment.startsWith(rivalSlug + "-");
        const rivalRight = segment.endsWith("-" + rivalSlug);
        if (rivalLeft && !rivalRight) return false;
        if (rivalRight && !rivalLeft) return true;
        const hasMid = ("-" + segment + "-").includes("-" + rivalSlug + "-");
        if (hasMid) return rivalLeft ? false : true;
      }
      return null;
    } catch {
      return null;
    }
  };

  // --------- Parsers ---------
  const parseH2HContainers = () => {
    let containers = $$(".container-xl.mb-5");
    const blocks = [];
    // Fallback: some pages (players/H2H) may not wrap in .container-xl.mb-5
    if (!containers.length) containers = [document];
    for (const cont of containers) {
      const top = $(".table-top", cont) || $(".table-top");
      if (!top) continue;
      const nameEls = $$(".gamer-name", top);
      const leftName = text(nameEls[0] || null);
      const rightName = text(nameEls[1] || null);

      // Collect rows from main H2H table(s), fallback to any .main-table on page
      let tables = $$("table.kmp_srt_results.main-table:not(.clone)", cont);
      if (!tables.length) tables = $$("table.kmp_srt_results.main-table:not(.clone)");
      const rows = [];
      for (const t of tables) rows.push(...$$("tbody > tr.personal-meetings", t));

      const seenLinks = new Set();
      const matches = [];
      for (const row of rows) {
        if (row.classList.contains("fw-bold")) continue;
        const a = $("td.date a", row);
        const url = absHref(a);
        if (!url || seenLinks.has(url)) continue;
        seenLinks.add(url);

        const dateStr = text($("td.date", row));
        const span = $("td.line-score span", row) || $("td.line-score", row);
        const finalScore = parseFinalScore(text(span));
        let sets = parseSetsFromTooltip(span);
        if (!sets.length) sets = parseSetsFromCells(row);
        if (!sets.length) sets = parseSetsFromRowText(row);

        matches.push({
          type: "h2h",
          url,
          date: dateStr,
          players: { left: leftName, right: rightName },
          finalScoreLeftRight: finalScore,
          setsLeftRight: sets
        });
      }
      if (leftName || rightName || matches.length) blocks.push({ players: { left: leftName, right: rightName }, matches });
    }
    return blocks;
  };

  const parseRecentSections = () => {
    const sections = [];
    const headers = $$(".gamer-name-2");
    for (const h of headers) {
      const ownPlayer = text(h).replace(/\(.*\)$/, "").trim();

      // Find the nearest following table with class kmp_srt_results
      let node = h.nextElementSibling;
      let table = null;
      while (node) {
        table = $("table.kmp_srt_results", node) || (node.matches && node.matches("table.kmp_srt_results") ? node : null);
        if (table) break;
        node = node.nextElementSibling;
      }
      if (!table) continue;

      const rows = $$("tbody > tr", table);
      const seen = new Set();
      const matches = [];
      for (const row of rows) {
        if (row.classList.contains('fw-bold')) continue; // skip summary rows
        const a = $("td.date a", row);
        const url = absHref(a);
        if (!url || seen.has(url)) continue;
        seen.add(url);

        const dateStr = text($("td.date", row));
        const span = $("td.line-score span", row) || $("td.line-score", row);
        const finalScore = parseFinalScore(text(span));
        let sets = parseSetsFromTooltip(span);
        if (!sets.length) sets = parseSetsFromCells(row);
        if (!sets.length) sets = parseSetsFromRowText(row);
        const rivalA = $("td.rival a", row);
        const opponent = text(rivalA);

        // Determine win/lose from row class and orient by comparing with final score
        const rowWon = row.classList.contains('win');
        let ownScore = null, oppScore = null, setsOwnFirst = null;
        if (finalScore) {
          const l = Number(finalScore.left), r = Number(finalScore.right);
          if (isFinite(l) && isFinite(r)) {
            if (rowWon) {
              ownScore = Math.max(l, r);
              oppScore = Math.min(l, r);
            } else {
              ownScore = Math.min(l, r);
              oppScore = Math.max(l, r);
            }
          }
        }
        // Try to orient per-set scores to match ownScore
        if (Array.isArray(sets) && sets.length) {
          const winsAsIs = sets.reduce((s,[x,y]) => s + (x>y?1:0), 0);
          const winsFlipped = sets.reduce((s,[x,y]) => s + (y>x?1:0), 0);
          if (ownScore != null) {
            if (winsAsIs === ownScore) {
              setsOwnFirst = sets;
            } else if (winsFlipped === ownScore) {
              setsOwnFirst = sets.map(([x,y]) => [y,x]);
            } else {
              // fallback: prefer orientation that is closer to ownScore
              const dAsIs = Math.abs((winsAsIs||0) - ownScore);
              const dFlip = Math.abs((winsFlipped||0) - ownScore);
              setsOwnFirst = dFlip < dAsIs ? sets.map(([x,y]) => [y,x]) : sets;
            }
          } else {
            // No final score parsed — assume as-is
            setsOwnFirst = sets;
            ownScore = winsAsIs;
            oppScore = sets.length - winsAsIs;
          }
        }

        matches.push({
          type: "recent",
          url,
          date: dateStr,
          ownPlayer,
          opponent,
          orientation: {
            ownIsLeft: null,
            left: null,
            right: null
          },
          finalScoreLeftRight: finalScore,
          setsLeftRight: sets,
          finalScoreOwnOpponent: ownScore != null && oppScore != null ? { own: ownScore, opponent: oppScore } : null,
          setsOwnOpponent: setsOwnFirst
        });
      }

      sections.push({ player: ownPlayer, matches });
    }
    return sections;
  };

  const parseAll = () => {
    const h2h = parseH2HContainers();
    const recents = parseRecentSections();

    // Determine top pair from first H2H block if available
    let topPlayers = null;
    if (h2h && h2h.length && h2h[0].players && (h2h[0].players.left || h2h[0].players.right)) {
      topPlayers = { left: h2h[0].players.left || null, right: h2h[0].players.right || null };
    } else if (recents && recents.length >= 2) {
      topPlayers = { left: recents[0].player || null, right: recents[1].player || null };
    }

    const patterns = computePatterns(recents, h2h);

    return {
      parsedAt: new Date().toISOString(),
      url: location.href,
      topPlayers,
      h2h,
      recents,
      patterns
    };
  };

  // --------- UI ---------
  const ensureButton = () => {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "tsx-copy-btn";
    btn.textContent = "Скопировать JSON результатов";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const data = parseAll();
        const json = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(json);
        btn.textContent = "Скопировано!";
        setTimeout(() => (btn.textContent = "Скопировать JSON результатов"), 1500);
        // Also log for immediate dev use
        // eslint-disable-next-line no-console
        console.log("[Tennis Score Extractor]", data);
      } catch (err) {
        // Fallback: open a new window with JSON
        const data = parseAll();
        const json = JSON.stringify(data, null, 2);
        // eslint-disable-next-line no-alert
        alert("Не удалось записать в буфер. Откроем JSON в новой вкладке.");
        const w = window.open();
        if (w && w.document) {
          const pre = w.document.createElement("pre");
          pre.textContent = json;
          w.document.body.appendChild(pre);
        }
      }
    });
    document.documentElement.appendChild(btn);
  };

  const install = () => {
    ensureButton();
    // Expose parser for console usage
    try {
      window.__tennisScoreExtract = parseAll;
      window.__renderDecisionSummary = renderDecisionSummary;
      window.__renderMinTwoSets = renderMinTwoSets;
    } catch {}
    try { insertAutoBlocks(); } catch(_) {}
  };

  // Observe significant DOM changes (site can be dynamic)
  const mo = new MutationObserver((mut) => {
    // If tables appear or our button was removed, re-add
    const addedAnyTable = mut.some((m) =>
      Array.from(m.addedNodes || []).some(
        (n) => n.nodeType === 1 && (n.matches?.("table.kmp_srt_results") || n.querySelector?.("table.kmp_srt_results"))
      )
    );
    if (addedAnyTable || !document.getElementById(BTN_ID)) {
      ensureButton();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Try to auto-insert summary blocks into the page
  function insertAutoBlocks() {
    let data = null;
    try { data = buildAnalyzeData({}); } catch(_) { return; }
    if (!data || !data.playerA || !data.playerB) return;
    const a10 = Number(data.playerA.nonBTProbability10 ?? data.playerA.nonBTProbability);
    const b10 = Number(data.playerB.nonBTProbability10 ?? data.playerB.nonBTProbability);
    const a5  = Number(data.playerA.nonBTProbability5);
    const b5  = Number(data.playerB.nonBTProbability5);
    const a3  = Number(data.playerA.nonBTProbability3);
    const b3  = Number(data.playerB.nonBTProbability3);
    if (!Number.isFinite(a10) || !Number.isFinite(b10)) return;
    const favIsA = a10 >= b10;
    const nameA = data?.playerA?.name || 'Игрок 1';
    const nameB = data?.playerB?.name || 'Игрок 2';
    const fav = { p10: favIsA ? a10 : b10, p5: favIsA ? a5 : b5, p3: favIsA ? a3 : b3 };
    const opp = { p10: favIsA ? b10 : a10, p5: favIsA ? b5 : a5, p3: favIsA ? b3 : a3 };
    fav.d5_10 = (Number.isFinite(fav.p5) && Number.isFinite(fav.p10)) ? (fav.p5 - fav.p10) : undefined;
    fav.d3_5  = (Number.isFinite(fav.p3) && Number.isFinite(fav.p5))  ? (fav.p3 - fav.p5)  : undefined;
    const form = { p3Fav: fav.p3, p3Opp: opp.p3 };
    const ml = { pFav3: Number.isFinite(data.predWinProbA) ? data.predWinProbA : undefined,
                 pOpp3: Number.isFinite(data.predWinProbB) ? data.predWinProbB : undefined };
    const match = { fav, opp, form, ml, baseProb: fav.p10, confidence: undefined, favName: (favIsA? nameA : nameB), oppName: (favIsA? nameB : nameA) };

    const htmlTop = renderMinTwoSets(match);
    const htmlDec = renderDecisionSummary(match);

    const containerId = 'tsx-auto-summaries';
    let holder = document.getElementById(containerId);
    if (!holder) {
      holder = document.createElement('div');
      holder.id = containerId;
      holder.style.margin = '10px 0';
      const anchor = document.querySelector('.table-top') || document.querySelector('.container-xl.mb-5') || document.body.firstElementChild || document.body;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(holder, anchor);
      } else {
        document.body.insertBefore(holder, document.body.firstChild);
      }
    }
    holder.innerHTML = htmlTop + htmlDec;
  }

  // Messaging: allow popup to request extraction
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      const safeSend = (payload) => { try { sendResponse(payload); } catch(_) {} };
      const ready = () => !!document.querySelector('.gamer-name-2') || !!document.querySelector('.table-top') || !!document.querySelector('table.kmp_srt_results') || !!document.querySelector('tr.personal-meetings');
      const waitForStatsDom = (maxMs = 8000, step = 100) => new Promise((resolve) => {
        if (ready()) return resolve(true);
        const t0 = Date.now();
        const id = setInterval(() => {
          if (ready() || (Date.now() - t0) >= maxMs) {
            clearInterval(id);
            resolve(ready());
          }
        }, step);
      });

      (async () => {
        try {
          if (msg && msg.type === "EXTRACT_JSON") {
            await waitForStatsDom();
            const data = parseAll();
            safeSend({ ok: true, data });
            return;
          }
          if (msg && (msg.action === 'analyze' || msg.type === 'ANALYZE')) {
            const readyNow = await waitForStatsDom();
            if (!readyNow) {
              safeSend({ success: false, error: 'Нет данных на странице. Обновите страницу или авторизуйтесь на сайте' });
              return;
            }
            const data = buildAnalyzeData(msg?.opts || {});
            safeSend({ success: true, data });
            return;
          }
          // Unknown message
          safeSend({ ok: false, error: 'Unknown message' });
        } catch (e) {
          if (msg && (msg.action === 'analyze' || msg.type === 'ANALYZE')) {
            safeSend({ success: false, error: String(e?.message || e) });
          } else {
            safeSend({ ok: false, error: String(e?.message || e) });
          }
        }
      })();
      return true; // keep the port open for async response
    });
  } catch {}
})();

// -------------- Pattern analysis --------------
function computePatterns(recentsSections, h2hBlocks) {
  const byPlayer = {};
  const add = (player, m) => {
    if (!player) return;
    if (!byPlayer[player]) byPlayer[player] = [];
    byPlayer[player].push(m);
  };
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const m of arr) {
      const k = m && m.url ? m.url : JSON.stringify([m.finalScoreOwnOpponent, m.setsOwnOpponent]);
      if (!seen.has(k)) { seen.add(k); out.push(m); }
    }
    return out;
  };

  // From recents
  (recentsSections || []).forEach((sec) => {
    const name = (sec && sec.player) || null;
    if (!name) return;
    (sec.matches || []).forEach((m) => {
      if (Array.isArray(m.setsOwnOpponent) && m.finalScoreOwnOpponent) add(name, m);
    });
  });

  // From H2H oriented for both players
  (h2hBlocks || []).forEach((blk) => {
    const L = blk?.players?.left || null;
    const R = blk?.players?.right || null;
    (blk.matches || []).forEach((m) => {
      const fs = m.finalScoreLeftRight;
      const sets = m.setsLeftRight;
      if (!fs || !Array.isArray(sets) || !sets.length) return;
      const leftMatch = {
        url: m.url,
        finalScoreOwnOpponent: { own: fs.left, opponent: fs.right },
        setsOwnOpponent: sets
      };
      const rightMatch = {
        url: m.url,
        finalScoreOwnOpponent: { own: fs.right, opponent: fs.left },
        setsOwnOpponent: sets.map(([a, b]) => [b, a])
      };
      if (L) add(L, leftMatch);
      if (R) add(R, rightMatch);
    });
  });

  const out = {};
  Object.keys(byPlayer).forEach((p) => {
    out[p] = analyzePlayer(dedupe(byPlayer[p]));
  });
  return { byPlayer: out };
}

function analyzePlayer(matches) {
  const res = initPatternCounters();
  for (const m of matches) {
    const sets = m.setsOwnOpponent;
    const ownWon = (m.finalScoreOwnOpponent?.own ?? 0) > (m.finalScoreOwnOpponent?.opponent ?? 0);
    const ownLost = !ownWon;

    // Helper: count own set wins prefix
    let ownSetWins = 0;
    let oppSetWins = 0;
    const ownSetWinFlags = [];
    for (const [a, b] of sets) {
      const w = a > b;
      ownSetWinFlags.push(w);
    }

    // 1) Wins after winning first set
    if (sets.length >= 1) {
      const wonFirst = sets[0][0] > sets[0][1];
      if (wonFirst) {
        res.wins_after_winning_first_set.d++;
        if (ownWon) res.wins_after_winning_first_set.n++;
      }
      const lostFirst = sets[0][0] < sets[0][1];
      if (lostFirst) {
        res.wins_after_losing_first_set.d++;
        if (ownWon) res.wins_after_losing_first_set.n++;
      }
    }

    // Running set wins to check 2:1 and 1:2 after 3 sets
    ownSetWins = 0; oppSetWins = 0;
    for (let i = 0; i < Math.min(3, sets.length); i++) {
      if (sets[i][0] > sets[i][1]) ownSetWins++; else if (sets[i][0] < sets[i][1]) oppSetWins++;
    }
    if (sets.length >= 3) {
      if (ownSetWins === 2 && oppSetWins === 1) {
        res.losses_after_leading_2_1.d++;
        if (ownLost) res.losses_after_leading_2_1.n++;
      }
      if (ownSetWins === 1 && oppSetWins === 2) {
        res.wins_after_trailing_1_2.d++;
        if (ownWon) res.wins_after_trailing_1_2.n++;
      }
    }

    // Two consecutive set wins occurred?
    let hasTwoWinStreak = false;
    for (let i = 1; i < ownSetWinFlags.length; i++) {
      if (ownSetWinFlags[i] && ownSetWinFlags[i - 1]) { hasTwoWinStreak = true; break; }
    }
    if (hasTwoWinStreak) {
      res.wins_with_two_set_streak.d++;
      if (ownWon) res.wins_with_two_set_streak.n++;
    }

    // 2:2 decider (5th set)
    if (sets.length >= 5) {
      // After 4 sets score 2:2?
      let a4 = 0, b4 = 0;
      for (let i = 0; i < 4; i++) {
        if (sets[i][0] > sets[i][1]) a4++; else if (sets[i][0] < sets[i][1]) b4++;
      }
      if (a4 === 2 && b4 === 2) {
        res.wins_when_2_2_decider.d++;
        if (ownWon) res.wins_when_2_2_decider.n++;
      }
    }

    // Wins after down 0:2 (first two sets lost)
    if (sets.length >= 3) {
      const down0_2 = sets[0][0] < sets[0][1] && sets[1][0] < sets[1][1];
      if (down0_2) {
        res.wins_after_down_0_2.d++;
        if (ownWon) res.wins_after_down_0_2.n++;
      }
    }

    // Tie-break (extra points) set losses: per set
    for (const [a, b] of sets) {
      if (isExtraPointsSet(a, b)) {
        res.tiebreak_set_losses.d++;
        if (a < b) res.tiebreak_set_losses.n++;
      }
    }
  }

  // Compute percentages
  const finalize = (p) => ({ n: p.n, d: p.d, pct: p.d ? Math.round((p.n / p.d) * 100) : null });
  const m1 = finalize(res.wins_after_winning_first_set);
  const m2 = finalize(res.losses_after_leading_2_1);
  const m3 = finalize(res.wins_with_two_set_streak);

  const components = [];
  if (m1.d) components.push((m1.pct ?? 0) / 100);
  if (m2.d) components.push(1 - ((m2.pct ?? 0) / 100));
  if (m3.d) components.push((m3.pct ?? 0) / 100);
  const stability = components.length ? Math.round(100 * (components.reduce((a, b) => a + b, 0) / components.length)) : null;

  return {
    wins_after_winning_first_set: m1,
    wins_after_losing_first_set: finalize(res.wins_after_losing_first_set),
    losses_after_leading_2_1: m2,
    wins_after_trailing_1_2: finalize(res.wins_after_trailing_1_2),
    wins_with_two_set_streak: m3,
    wins_when_2_2_decider: finalize(res.wins_when_2_2_decider),
    wins_after_down_0_2: finalize(res.wins_after_down_0_2),
    tiebreak_set_losses: finalize(res.tiebreak_set_losses),
    stability
  };
}

function initPatternCounters() {
  return {
    wins_after_winning_first_set: { n: 0, d: 0 },
    wins_after_losing_first_set: { n: 0, d: 0 },
    losses_after_leading_2_1: { n: 0, d: 0 },
    wins_after_trailing_1_2: { n: 0, d: 0 },
    wins_with_two_set_streak: { n: 0, d: 0 },
    wins_when_2_2_decider: { n: 0, d: 0 },
    wins_after_down_0_2: { n: 0, d: 0 },
    tiebreak_set_losses: { n: 0, d: 0 }
  };
}

function isExtraPointsSet(a, b) {
  const aa = Number(a), bb = Number(b);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return false;
  // Extra points if both reached at least 10 and someone won by 2 beyond 10:10
  if (aa >= 10 && bb >= 10 && Math.abs(aa - bb) >= 2 && Math.max(aa, bb) >= 12) return true;
  return false;
}

// -------------- Analyze data for popup --------------
function buildAnalyzeData(userOpts = {}) {
  let all = null;
  try {
    if (typeof window !== 'undefined' && typeof window.__tennisScoreExtract === 'function') {
      all = window.__tennisScoreExtract();
    }
  } catch {}
  if (!all) throw new Error('parseAll failed');
  // Determine pair
  let left = all?.h2h?.[0]?.players?.left || null;
  let right = all?.h2h?.[0]?.players?.right || null;
  if (!left || !right) {
    left = all?.recents?.[0]?.player || left;
    right = all?.recents?.[1]?.player || right;
  }
  if (!left || !right) throw new Error('Не удалось определить пару игроков');

  const secA = (all.recents || []).find((s) => s.player === left) || { matches: [] };
  const secB = (all.recents || []).find((s) => s.player === right) || { matches: [] };

  // Build oriented H2H matches per player name
  const orientH2HFor = (playerName) => {
    const out = [];
    for (const blk of (all.h2h || [])) {
      const L = blk?.players?.left || null;
      const R = blk?.players?.right || null;
      if (!L || !R) continue;
      const isLeftPlayer = playerName === L;
      const isRightPlayer = playerName === R;
      if (!isLeftPlayer && !isRightPlayer) continue;
      for (const m of (blk.matches || [])) {
        const fs = m.finalScoreLeftRight;
        const sets = m.setsLeftRight;
        if (!fs || !Array.isArray(sets) || !sets.length) continue;
        if (isLeftPlayer) {
          out.push({ url: m.url, finalScoreOwnOpponent: { own: fs.left, opponent: fs.right }, setsOwnOpponent: sets });
        } else {
          out.push({ url: m.url, finalScoreOwnOpponent: { own: fs.right, opponent: fs.left }, setsOwnOpponent: sets.map(([a,b]) => [b,a]) });
        }
      }
    }
    return out;
  };

  const recA = (secA.matches || []).filter((m) => Array.isArray(m.setsOwnOpponent) && m.finalScoreOwnOpponent);
  const recB = (secB.matches || []).filter((m) => Array.isArray(m.setsOwnOpponent) && m.finalScoreOwnOpponent);
  const h2hA = orientH2HFor(left);
  const h2hB = orientH2HFor(right);
  const dedupeByUrl = (arr) => {
    const seen = new Set();
    const out = [];
    for (const m of arr) {
      const k = m && m.url ? m.url : JSON.stringify([m.finalScoreOwnOpponent, m.setsOwnOpponent]);
      if (!seen.has(k)) { seen.add(k); out.push(m); }
    }
    return out;
  };

  // Use only last 10 recent matches for pattern stats (no H2H here)
  const recA10 = recA.slice(0, 10);
  const recB10 = recB.slice(0, 10);
  const playerA = buildPlayerFromRecent(left, recA10);
  const playerB = buildPlayerFromRecent(right, recB10);

  // Aggregate set wins per set index and totals for all available matches
  const calcSetWinsFromMatches = (matches) => {
    const per = Array.from({length: 5}, () => ({ win: 0, total: 0 }));
    let totalWins = 0, totalSets = 0;
    (matches || []).forEach(m => {
      const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
      sets.forEach(([a,b], idx) => {
        if (idx >= 5) return;
        per[idx].total++;
        if (a > b) { per[idx].win++; totalWins++; }
        totalSets++;
      });
    });
    return { per, totalWins, totalSets };
  };
  playerA.sets = calcSetWinsFromMatches(recA);
  playerB.sets = calcSetWinsFromMatches(recB);

  // Visualization strings for ALL available matches (🟢 win / 🔴 loss)
  const toVis = (arr) => {
    const L = (arr || []);
    const dots = L.map(m => {
      const fo = m.finalScoreOwnOpponent;
      return fo && typeof fo.own === 'number' && typeof fo.opponent === 'number' && fo.own > fo.opponent ? '🟢' : '🔴';
    });
    return dots.join(' ');
  };
  try { playerA.visualization = toVis(recA); } catch(_) {}
  try { playerB.visualization = toVis(recB); } catch(_) {}

  // H2H visualization relative to playerA (left)
  const h2hVis = (() => {
    const L = [];
    for (const m of h2hA) {
      const fo = m.finalScoreOwnOpponent;
      const win = fo && typeof fo.own === 'number' && typeof fo.opponent === 'number' && fo.own > fo.opponent;
      L.push(win ? '🟢' : '🔴');
      if (L.length >= 10) break;
    }
    return L.join(' ');
  })();

  // H2H set wins per set index and totals (based on oriented H2H arrays)
  const h2hSets = (() => {
    const calc = (arr) => {
      const per = Array.from({length: 5}, () => ({ win: 0, total: 0 }));
      let totalWins = 0, totalSets = 0;
      (arr || []).forEach(m => {
        const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
        sets.forEach(([a,b], idx) => {
          if (idx >= 5) return;
          per[idx].total++;
          if (a > b) { per[idx].win++; totalWins++; }
          totalSets++;
        });
      });
      return { per, totalWins, totalSets };
    };
    return { A: calc(h2hA), B: calc(h2hB) };
  })();

  // H2H match wins summary (from oriented H2H arrays)
  const h2hMatchSummary = (() => {
    const countWins = (arr) => {
      let w = 0, t = 0;
      (arr || []).forEach(m => {
        const fo = m.finalScoreOwnOpponent;
        if (!fo || typeof fo.own !== 'number' || typeof fo.opponent !== 'number') return;
        t++;
        if (fo.own > fo.opponent) w++;
      });
      return { wins: w, total: t };
    };
    const A = countWins(h2hA);
    const B = countWins(h2hB);
    return { A, B };
  })();

  // Common opponents using ALL available matches on page
  const commonOpponents = (() => {
    const normalize = (s) => {
      if (!s || typeof s !== 'string') return null;
      let t = s.replace(/[\u00A0\s]+/g, ' ');
      t = t.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
      return t.trim().toLowerCase();
    };
    const aggregate = (matches) => {
      const map = new Map();
      (matches || []).forEach(m => {
        const key = normalize(m.opponent);
        if (!key) return;
        const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
        const ownSets = sets.reduce((s,[a,b]) => s + (a>b?1:0), 0);
        const oppSets = sets.length - ownSets;
        const ownPts = sets.reduce((s,[a]) => s + (Number(a)||0), 0);
        const oppPts = sets.reduce((s,[,b]) => s + (Number(b)||0), 0);
        const win = (m.finalScoreOwnOpponent?.own ?? 0) > (m.finalScoreOwnOpponent?.opponent ?? 0);
        const prev = map.get(key) || { name: m.opponent, matches:0, wins:0, losses:0, setsWon:0, setsLost:0, pointsDiff:0, score:0 };
        if (m.opponent && m.opponent.length > (prev.name||'').length) prev.name = m.opponent;
        prev.matches += 1;
        if (win) prev.wins += 1; else prev.losses += 1;
        prev.setsWon += ownSets;
        prev.setsLost += oppSets;
        prev.pointsDiff += (ownPts - oppPts);
        const w = 1;
        prev.score += w * ((win ? 1 : -1) + 0.3*(ownSets - oppSets) + 0.02*(ownPts - oppPts));
        map.set(key, prev);
      });
      return map;
    };
    const mapA = aggregate(recA);
    const mapB = aggregate(recB);
    const rows = [];
    for (const k of mapA.keys()) {
      if (!mapB.has(k)) continue;
      const a = mapA.get(k), b = mapB.get(k);
      const advVal = (a.score||0) - (b.score||0);
      const advantage = advVal > 0.25 ? 'A' : (advVal < -0.25 ? 'B' : '=');
      rows.push({
        opponent: a.name || b.name || '—',
        a: { matches:a.matches, wins:a.wins, losses:a.losses, setsWon:a.setsWon, setsLost:a.setsLost, pointsDiff:a.pointsDiff },
        b: { matches:b.matches, wins:b.wins, losses:b.losses, setsWon:b.setsWon, setsLost:b.setsLost, pointsDiff:b.pointsDiff },
        advantage
      });
    }
    rows.sort((x,y) => {
      const sx = (x.a.wins - x.b.wins) + 0.2*((x.a.setsWon-x.a.setsLost) - (x.b.setsWon-x.b.setsLost)) + 0.02*((x.a.pointsDiff)-(x.b.pointsDiff));
      const sy = (y.a.wins - y.b.wins) + 0.2*((y.a.setsWon-y.a.setsLost) - (y.b.setsWon-y.b.setsLost)) + 0.02*((y.a.pointsDiff)-(y.b.pointsDiff));
      return Math.abs(sy) - Math.abs(sx);
    });
    return rows;
  })();

  // Bradley–Terry block: prefer MM pairs on last 10 + H2H; fallback to extended model
  let btTop3 = [];
  let btInfo = null;
  try {
    const parseDate = (d) => {
      if (!d || typeof d !== 'string') return null;
      const mm = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
      if (mm) { let dd=+mm[1], mo=+mm[2]-1, yy=+mm[3]; if(yy<100) yy+=2000; const dt=new Date(yy,mo,dd); if(!isNaN(dt.getTime())) return dt; }
      return null;
    };
    // Prepare match objects for extended BT (adaptive: use all available, cap by 40)
    const toBtMatchesFromRecents = (matches, playerName) => {
      const arr = [];
      for (const m of (matches||[])){
        const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
        if (!sets.length) continue;
        const d = parseDate(m.date) || new Date(0);
        const opp = m.opponent || 'Opponent';
        // own perspective is playerName vs opponent
        arr.push({ home: playerName, away: opp, sets: sets.map(([a,b])=>[Number(a)||0, Number(b)||0]), date: d });
      }
      // Sort by date desc and cap to 40 for compute stability/perf
      arr.sort((a,b)=> (b.date?.getTime?.()||0)-(a.date?.getTime?.()||0));
      return arr.slice(0, 40);
    };
    const lastA = toBtMatchesFromRecents(recA, left);
    const lastB = toBtMatchesFromRecents(recB, right);
    const h2hMatches = (() => {
      const arr = [];
      for (const blk of (all.h2h || [])){
        const Lp = blk?.players?.left || null; const Rp = blk?.players?.right || null;
        if (!Lp || !Rp) continue;
        const same = (Lp===left && Rp===right) || (Lp===right && Rp===left);
        if (!same) continue;
        for (const m of (blk.matches || [])){
          const d = parseDate(m.date) || new Date(0);
          const setsLR = Array.isArray(m.setsLeftRight) ? m.setsLeftRight : [];
          if (!setsLR.length) continue;
          let sets;
          if (Lp === left && Rp === right) {
            sets = setsLR.map(([a,b])=>[Number(a)||0, Number(b)||0]);
          } else {
            // reverse to align as left(A) vs right(B)
            sets = setsLR.map(([a,b])=>[Number(b)||0, Number(a)||0]);
          }
          arr.push({ home: left, away: right, sets, date: d });
        }
      }
      // Use all, but cap to 30 to avoid overweighting old H2H
      arr.sort((a,b)=> (b.date?.getTime?.()||0)-(a.date?.getTime?.()||0));
      return arr.slice(0, 30);
    })();

    if (window.BTMM && typeof window.BTMM.computeTop3Scores === 'function'){
      // Fallback to pairwise MM using last up to 10 per source
      const toPairsFromRecents = (matches, playerName) => {
        const out = [];
        for (const m of matches){
          const d = parseDate(m.date) || new Date(0);
          const fo = m.finalScoreOwnOpponent;
          if (!fo || typeof fo.own !== 'number' || typeof fo.opponent !== 'number') continue;
          const opp = m.opponent || 'Opponent';
          if (fo.own > fo.opponent) out.push({date:d, w:playerName, l:opp}); else out.push({date:d, w:opp, l:playerName});
        }
        out.sort((a,b)=> (b.date?.getTime?.()||0)-(a.date?.getTime?.()||0));
        return out.slice(0,10).map(x=>[x.w,x.l]);
      };
      const pairsA = toPairsFromRecents(recA, left);
      const pairsB = toPairsFromRecents(recB, right);
      const h2hPairs = (() => {
        const arr = [];
        for (const blk of (all.h2h || [])){
          const Lp = blk?.players?.left || null; const Rp = blk?.players?.right || null;
          if (!Lp || !Rp) continue;
          const same = (Lp===left && Rp===right) || (Lp===right && Rp===left);
          if (!same) continue;
          for (const m of (blk.matches || [])){
            const fs = m.finalScoreLeftRight; const d = parseDate(m.date) || new Date(0);
            if (!fs || typeof fs.left !== 'number' || typeof fs.right !== 'number') continue;
            if (fs.left > fs.right) arr.push({date:d, w:Lp, l:Rp}); else if (fs.right > fs.left) arr.push({date:d, w:Rp, l:Lp});
          }
        }
        arr.sort((a,b)=> (b.date?.getTime?.()||0)-(a.date?.getTime?.()||0));
        return arr.slice(0,10).map(x=>[x.w,x.l]);
      })();
      const res = window.BTMM.computeTop3Scores(left, right, pairsA, pairsB, h2hPairs, { l2: 1e-3 });
      btTop3 = (res.top3||[]).map(x=>({score:x.score, probability:x.probability}));
      // Moderation to avoid extreme 0/100 rendering
      const shrink = (p)=>{ p=Math.max(0,Math.min(1,p)); const s=0.85; return 0.5 + s*(p-0.5); };
      btInfo = { p_match: shrink(res.p_match), p_set: shrink(res.p_set) };
    } else if (window.BradleyTerry && typeof window.BradleyTerry.btWinner === 'function'){
      const res = window.BradleyTerry.btWinner(lastA, lastB, h2hMatches, left, right, {});
      btTop3 = (res.scores||[]).slice(0,3).map(x=>({score:x.score, probability:x.probability}));
      const shrink = (p)=>{ p=Math.max(0,Math.min(1,p)); const s=0.85; return 0.5 + s*(p-0.5); };
      btInfo = { p_match: shrink(res.p_match), p_set: shrink(res.p_set) };
    }
  } catch(_) {}

  // --- Main strength (S) and Effective strength (E) ---
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const computeMainStrength = (rec10, fallbackS2, fallbackS5) => {
    try {
      const L = rec10 || [];
      if (!Array.isArray(L) || !L.length) throw new Error('no recents');
      // winRate10
      const wins = L.reduce((s, m) => {
        const e = enrichMatch(m); return s + (e.win ? 1 : 0);
      }, 0);
      const winRate10 = wins / L.length;
      // setWinRate10
      let setWon = 0, setTot = 0, ptsWon = 0, ptsTot = 0;
      for (const m of L) {
        const e = enrichMatch(m);
        setWon += e.ownSets; setTot += (e.ownSets + e.oppSets);
        ptsWon += e.ownPts; ptsTot += (e.ownPts + e.oppPts);
      }
      const setWinRate10 = setTot ? (setWon / setTot) : 0.5;
      const pointShare10 = ptsTot ? (ptsWon / ptsTot) : 0.5;
      const Sraw = 0.45 * winRate10 + 0.35 * setWinRate10 + 0.20 * pointShare10;
      const S = Math.round(100 * clamp01(Sraw));
      // Fallback for small sample
      if (L.length < 5 || setTot < 15) {
        const s2 = typeof fallbackS2 === 'number' ? fallbackS2 : S;
        const s5 = typeof fallbackS5 === 'number' ? fallbackS5 : S;
        return Math.round(0.6 * s5 + 0.4 * s2);
      }
      return S;
    } catch (_) {
      const s2 = typeof fallbackS2 === 'number' ? fallbackS2 : null;
      const s5 = typeof fallbackS5 === 'number' ? fallbackS5 : null;
      return (s2 != null && s5 != null) ? Math.round(0.6 * s5 + 0.4 * s2) : null;
    }
  };
  const computeEffStrength = (S, stab01, gamesToday, lastDays, h2hRateA, h2hRateB) => {
    const f_stab = 0.6 + 0.4 * clamp01(stab01 ?? 0.5);
    const g = Math.max(0, Number(gamesToday || 0));
    const f_load = Math.max(0.6, 1 - 0.04 * Math.max(0, g - 2));
    let f_rest = 1.0;
    const d = Number(lastDays);
    if (!isNaN(d)) { if (d === 0) f_rest = 0.95; else if (d === 1) f_rest = 0.98; }
    let f_h2h = 1.0;
    try {
      const rA = Number(h2hRateA || 0);
      const rB = Number(h2hRateB || 0);
      const h = clamp(rA - rB, -1, 1);
      f_h2h = clamp(1 + 0.08 * h, 0.92, 1.08);
    } catch {}
    const Eraw = Number(S || 0) * f_stab * f_load * f_rest * f_h2h;
    return Math.round(clamp(Eraw, 0, 100));
  };

  try {
    // Main strength
    const S2A = typeof playerA?.stats?.S2 === 'number' ? playerA.stats.S2 : null;
    const S5A = typeof playerA?.stats?.S5 === 'number' ? playerA.stats.S5 : null;
    const S2B = typeof playerB?.stats?.S2 === 'number' ? playerB.stats.S2 : null;
    const S5B = typeof playerB?.stats?.S5 === 'number' ? playerB.stats.S5 : null;
    playerA.mainStrength = computeMainStrength(recA10, S2A, S5A);
    playerB.mainStrength = computeMainStrength(recB10, S2B, S5B);

    // Effective strength
    const stabA01 = (typeof playerA?.stability === 'number') ? clamp01(playerA.stability) : 0.5;
    const stabB01 = (typeof playerB?.stability === 'number') ? clamp01(playerB.stability) : 0.5;
    const gA = Number(playerA.stats?.matchesToday?.total || 0);
    const gB = Number(playerB.stats?.matchesToday?.total || 0);
    const dA = Number(playerA.stats?.lastGameDays);
    const dB = Number(playerB.stats?.lastGameDays);
    const rA = (h2hSets?.A?.totalSets > 0) ? (h2hSets.A.totalWins / h2hSets.A.totalSets) : null;
    const rB = (h2hSets?.B?.totalSets > 0) ? (h2hSets.B.totalWins / h2hSets.B.totalSets) : null;
    playerA.effStrength = computeEffStrength(playerA.mainStrength, stabA01, gA, dA, rA, rB);
    playerB.effStrength = computeEffStrength(playerB.mainStrength, stabB01, gB, dB, rB, rA);
  } catch(_) {}

  // --- Player stats (10 matches unless noted) ---
  function parseDateLocal(d) {
    if (!d || typeof d !== 'string') return null;
    const mm = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (mm) {
      let dd = Number(mm[1]), mo = Number(mm[2]) - 1, yy = Number(mm[3]);
      if (yy < 100) yy += 2000;
      const dt = new Date(yy, mo, dd);
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  }
  function enrichMatch(m) {
    const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
    const ownSets = sets.reduce((s,[a,b]) => s + (a>b?1:0), 0);
    const oppSets = sets.length - ownSets;
    const ownPts = sets.reduce((s,[a]) => s + (Number(a)||0), 0);
    const oppPts = sets.reduce((s,[,b]) => s + (Number(b)||0), 0);
    const d = parseDateLocal(m.date);
    return { win: ownSets > oppSets, ownSets, oppSets, ownPts, oppPts, date: d };
  }
  function calcMatchesTodayFrom(rec) {
    const today = new Date(); today.setHours(0,0,0,0);
    let total=0, wins=0, losses=0;
    for (const m of rec) {
      const em = enrichMatch(m);
      if (!em.date) continue;
      const d = new Date(em.date); d.setHours(0,0,0,0);
      if (d.getTime() === today.getTime()) { total++; if (em.win) wins++; else losses++; }
    }
    return { total, wins, losses };
  }
  // --- Strength series per match ([-1;1] → mapped to [0;100]) ---
  const ST_POINTS_PER_SET = 11;
  const ST_W_SET = 0.7;  // default per new method
  const ST_W_PTS = 0.3;
  const ST_EMA_ALPHA = 0.4;

  function gameStrengthFrom(m, {pointsPerSet=ST_POINTS_PER_SET, wSet=ST_W_SET, wPts=ST_W_PTS}={}){
    try {
      const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
      let setsFor = 0, setsAgainst = 0;
      for (const [a,b] of sets) { if (a>b) setsFor++; else if (b>a) setsAgainst++; }
      const totalSets = setsFor + setsAgainst;
      if (totalSets <= 0) return 0.5; // нейтрально

      // Доля выигранных сетов 0..1
      const shareSets = setsFor / Math.max(1, totalSets);

      // Доля выигранных очков 0..1 (fallback к shareSets, если очки не распарсились)
      let ownPts = 0, oppPts = 0;
      for (const [a,b] of sets) { ownPts += (Number(a)||0); oppPts += (Number(b)||0); }
      const totalPts = ownPts + oppPts;
      const sharePts = totalPts > 0 ? (ownPts / totalPts) : shareSets;

      const s = Math.max(0, Math.min(1, wSet * shareSets + wPts * sharePts));
      return s; // 0..1
    } catch(_) { return 0; }
  }

  function buildSuccessSeries(rec, {wSet=ST_W_SET, wPts=ST_W_PTS}={}) {
    try {
      const L = (rec || []).slice(0, 10);
      const items = L.map(m => {
        const e = enrichMatch(m);
        const t = e.date ? e.date.getTime() : 0;
        const s = gameStrengthFrom(m, {wSet, wPts}); // 0..1
        const v = Math.round(100 * s);
        return { v, s, t };
      });
      items.sort((a,b)=> (a.t||0) - (b.t||0));
      return items.map(x=>x.v);
    } catch(_) { return []; }
  }

  function emaStrength(values, alpha=ST_EMA_ALPHA){
    if (!values || !values.length) return 0;
    let s = values[0];
    for (let i=1;i<values.length;i++) s = alpha*values[i] + (1-alpha)*s;
    return s;
  }
  function linForecastStrength(values, xNext){
    const n = (values||[]).length;
    if (n === 0) return 0;
    if (n === 1) return values[0];
    let sumX=0, sumY=0, sumXY=0, sumXX=0;
    for (let i=0;i<n;i++){
      const x=i+1, y=values[i];
      sumX+=x; sumY+=y; sumXY+=x*y; sumXX+=x*x;
    }
    const denom = n*sumXX - sumX*sumX;
    const a = denom !== 0 ? (n*sumXY - sumX*sumY)/denom : 0; // slope
    const b = (sumY - a*sumX)/n;
    return a*xNext + b;
  }
  function forecast11thFromSeriesPct(seriesPct, emaAlpha=ST_EMA_ALPHA){
    try{
      // convert [0;100] → [0;1]
      const vals = (seriesPct||[]).map(p=> Math.max(0, Math.min(1, (Number(p)||0)/100)));
      const emaVal = emaStrength(vals, emaAlpha);
      const linVal = linForecastStrength(vals, vals.length+1);
      const f = Math.max(0, Math.min(1, 0.5*emaVal + 0.5*linVal));
      // back to [0;100]
      return Math.round(100 * f);
    } catch(_){ return null; }
  }
  function expectedSuccessFromDist(dist){
    try {
      if (!dist) return null;
      const v = (
        (dist['3:0']||0)*1.0 +
        (dist['3:1']||0)*(3/4) +
        (dist['3:2']||0)*(3/5) +
        (dist['2:3']||0)*(2/5) +
        (dist['1:3']||0)*(1/4) +
        (dist['0:3']||0)*0.0
      );
      return Math.round(100 * Math.max(0, Math.min(1, v)));
    } catch(_) { return null; }
  }
  function daysSinceLast(rec) {
    let best = null;
    for (const m of rec) { const d = enrichMatch(m).date; if (d && (!best || d > best)) best = d; }
    if (!best) return null;
    const diffMs = Date.now() - best.getTime();
    return Math.max(0, Math.floor(diffMs / 86400000));
  }
  function lastMatchDate(rec) {
    let best = null;
    for (const m of rec) {
      const d = enrichMatch(m).date;
      if (d && (!best || d > best)) best = d;
    }
    return best;
  }
  function formatDateDDMMYYYY(d) {
    try {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}.${mm}.${yy}`;
    } catch { return null; }
  }
  function calcScorePoints(rec, limit = 10) {
    const L = rec.slice(0, limit);
    let total = 0, n = 0;
    for (const m of L) {
      const e = enrichMatch(m);
      const ps = e.ownSets, os = e.oppSets;
      let pts = 0;
      if (ps === 3) pts = 3 - os; else if (os === 3) pts = -(3 - ps);
      total += pts; n++;
    }
    return { totalPoints: total, matchesAnalyzed: n, averagePoints: n ? (total/n).toFixed(2) : '0.00' };
  }
  function calcPointsSummary(rec, limit = 10) {
    const L = rec.slice(0, limit);
    let won = 0, lost = 0;
    for (const m of L) { const e = enrichMatch(m); won += e.ownPts; lost += e.oppPts; }
    const n = L.length;
    const diff = won - lost;
    const ratio = (won + lost) > 0 ? (won / Math.max(1, lost)) : null;
    const avgDiff = n > 0 ? diff / n : 0;
    return { won, lost, diff, ratio, matches: n, avgDiff };
  }
  function calcDry(rec, limit = 10) {
    const L = rec.slice(0, limit);
    let dryW=0, dryL=0;
    for (const m of L) {
      const e = enrichMatch(m);
      if (e.ownSets === 3 && e.oppSets === 0) dryW++;
      if (e.oppSets === 3 && e.ownSets === 0) dryL++;
    }
    return { wins: dryW, losses: dryL };
  }
  function calcStrength(rec, n) {
    const L = rec.slice(0, n);
    if (!L.length) return null;
    let winCnt=0, setWon=0, setTot=0;
    for (const m of L) { const e = enrichMatch(m); if (e.win) winCnt++; setWon += e.ownSets; setTot += (e.ownSets + e.oppSets); }
    const winRate = winCnt / L.length;
    const setRate = setTot ? (setWon / setTot) : 0.5;
    const score = Math.round(100 * Math.max(0, Math.min(1, 0.7*winRate + 0.3*setRate)));
    return score;
  }

  playerA.stats = {
    S2: calcStrength(recA10, 2),
    S5: calcStrength(recA10, 5),
    dry: calcDry(recA10, 10),
    matchesToday: calcMatchesTodayFrom(recA10),
    lastGameDays: daysSinceLast(recA10),
    lastGameDate: (() => { const d = lastMatchDate(recA10); return d ? formatDateDDMMYYYY(d) : null; })(),
    scorePoints10: calcScorePoints(recA10, 10),
    pointsSummary10: calcPointsSummary(recA10, 10)
  };
  playerB.stats = {
    S2: calcStrength(recB10, 2),
    S5: calcStrength(recB10, 5),
    dry: calcDry(recB10, 10),
    matchesToday: calcMatchesTodayFrom(recB10),
    lastGameDays: daysSinceLast(recB10),
    lastGameDate: (() => { const d = lastMatchDate(recB10); return d ? formatDateDDMMYYYY(d) : null; })(),
    scorePoints10: calcScorePoints(recB10, 10),
    pointsSummary10: calcPointsSummary(recB10, 10)
  };

  // Flatten fields expected by popup.js "Статистика игроков"
  try {
    // S2/S5 as 0..100 rounded
    playerA.s2 = (typeof playerA.stats?.S2 === 'number') ? Math.round(playerA.stats.S2) : null;
    playerA.s5 = (typeof playerA.stats?.S5 === 'number') ? Math.round(playerA.stats.S5) : null;
    playerB.s2 = (typeof playerB.stats?.S2 === 'number') ? Math.round(playerB.stats.S2) : null;
    playerB.s5 = (typeof playerB.stats?.S5 === 'number') ? Math.round(playerB.stats.S5) : null;

    // Dry wins/losses
    playerA.dryWins = playerA.stats?.dry?.wins ?? null;
    playerA.dryLosses = playerA.stats?.dry?.losses ?? null;
    playerB.dryWins = playerB.stats?.dry?.wins ?? null;
    playerB.dryLosses = playerB.stats?.dry?.losses ?? null;

    // Matches today and last game days
    playerA.matchesToday = playerA.stats?.matchesToday ?? null;
    playerA.lastGameDays = playerA.stats?.lastGameDays ?? null;
    playerA.lastGameDate = playerA.stats?.lastGameDate ?? null;
    playerB.matchesToday = playerB.stats?.matchesToday ?? null;
    playerB.lastGameDays = playerB.stats?.lastGameDays ?? null;
    playerB.lastGameDate = playerB.stats?.lastGameDate ?? null;

    // Score points and summary for last 5 (for UI labels “(5 матчей)”) + keep 10 in stats
    playerA.scorePoints = calcScorePoints(recA10, 5);
    playerB.scorePoints = calcScorePoints(recB10, 5);
    playerA.pointsSummary5 = calcPointsSummary(recA10, 5);
    playerB.pointsSummary5 = calcPointsSummary(recB10, 5);
  } catch(_) {}
  const out = {
    playerA,
    playerB,
    h2h: { visualization: h2hVis, sets: h2hSets, summary: h2hMatchSummary, total: (h2hMatchSummary?.A?.total||0) },
    commonOpponents,
    bt: { top3: btTop3, p_match: btInfo?.p_match, p_set: btInfo?.p_set, dist: btInfo?.dist }
  };
  // Expose recent oriented matches (last 10) and oriented H2H for downstream indices/visualizations
  try {
    out.recentsA10 = recA10;
    out.recentsB10 = recB10;
    out.h2hOrientedA = h2hA;
    out.h2hOrientedB = h2hB;
  } catch(_) {}
  try {
    // Enrich with series and predicted success for 11th match
    // Prepare weights from user options
    const wSet = (typeof userOpts?.w_set === 'number') ? Math.min(1, Math.max(0, userOpts.w_set)) : ST_W_SET;
    const wPts = (typeof userOpts?.w_pts === 'number') ? Math.min(1, Math.max(0, userOpts.w_pts)) : (1 - wSet);
    const emaAlpha = (typeof userOpts?.ema_alpha === 'number') ? Math.min(0.99, Math.max(0.01, userOpts.ema_alpha)) : ST_EMA_ALPHA;

    out.playerA.successSeries10 = buildSuccessSeries(recA10, {wSet, wPts});
    out.playerB.successSeries10 = buildSuccessSeries(recB10, {wSet, wPts});
    const predA = forecast11thFromSeriesPct(out.playerA.successSeries10, emaAlpha);
    const predB = forecast11thFromSeriesPct(out.playerB.successSeries10, emaAlpha);
    out.predSuccessA11 = (typeof predA === 'number') ? predA : null;
    out.predSuccessB11 = (typeof predB === 'number') ? predB : null;
    // Прогноз вероятности победы на основе разницы прогнозных индексов
    try {
      if (typeof predA === 'number' && typeof predB === 'number') {
        const sA = predA / 100; const sB = predB / 100;
        const k = (typeof userOpts?.k === 'number') ? Math.max(0.5, Math.min(20, userOpts.k)) : 5.0; // крутизна сигмоиды
        const pA = 1 / (1 + Math.exp(-k * (sA - sB)));
        out.predWinProbA = Math.round(pA * 100);
        out.predWinProbB = 100 - out.predWinProbA;
      }
    } catch(_) {}

    // -------- Новая логика формы (F) и силы (S*) для блока «Индекс силы и форма (10 игр)» --------
    const clamp01 = (x)=> Math.max(0, Math.min(1, Number(x)||0));
    const ema = (arr, a)=>{
      if (!Array.isArray(arr) || arr.length===0) return 0.5;
      let s = Number(arr[0])||0; for (let i=1;i<arr.length;i++){ s = a*(Number(arr[i])||0) + (1-a)*s; }
      return clamp01(s);
    };
    const winsArray = (rec)=> (rec||[]).slice(0,10).map(m=>{ const fo=m?.finalScoreOwnOpponent; return (fo && Number(fo.own)>Number(fo.opponent)) ? 1 : 0; });
    const extFromPatterns = (pat)=>{
      try {
        const C1 = 1 - (pat?.loss_after_2_1_obj?.rate || 0);
        const C2 = 1 - (pat?.loss_after_two_set_run?.rate || 0);
        const C3 = 1 - (pat?.tiebreak_losses?.rate || 0);
        const C4 = (pat?.decisive_fifth_wins?.rate || pat?.win_at_2_2?.rate || 0);
        return Math.round(100*(0.30*C1 + 0.30*C2 + 0.20*C3 + 0.20*C4));
      } catch(_) { return 0; }
    };
    const lastLosses = (arr, k)=>{
      let cnt=0; for (let i=0;i<Math.min(k,(arr||[]).length);i++){ const fo=arr[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) cnt++; }
      return cnt===k;
    };
    const F_build = (rec, pd5, pd10, lastDays, h2hArr)=>{
      const w = winsArray(rec);
      const F_slow = ema(w, 0.3);
      const F_fast = ema(w.slice(0,5), 0.7);
      let F_raw = 0.6*F_slow + 0.4*F_fast;
      if ((Number(pd10)||0) >= 25) F_raw -= 0.2;
      if ((Number(pd10)||0) <= -25) F_raw += 0.1;
      const lost2 = lastLosses(h2hArr,2); const won2 = (function(){ let cnt=0; for(let i=0;i<Math.min(2,(h2hArr||[]).length);i++){ const fo=h2hArr[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===true) cnt++; } return cnt===2; })();
      if (lost2) F_raw -= 0.2; else if (won2) F_raw += 0.1;
      const fresh = (function(){ const d=Number(lastDays); const w = 1 - (isNaN(d)?0:d/7); return Math.max(0.6, Math.min(1, w)); })();
      return { F_slow, F_fast, F_final: clamp01(F_raw * fresh) };
    };
    const FA = F_build(recA10, playerA?.pointsSummary5?.diff, playerA?.stats?.pointsSummary10?.diff, playerA?.stats?.lastGameDays, out.h2hOrientedA);
    const FB = F_build(recB10, playerB?.pointsSummary5?.diff, playerB?.stats?.pointsSummary10?.diff, playerB?.stats?.lastGameDays, out.h2hOrientedB);
    out.playerA.F_slow = FA.F_slow; out.playerA.F_fast = FA.F_fast; out.playerA.F_final = FA.F_final;
    out.playerB.F_slow = FB.F_slow; out.playerB.F_fast = FB.F_fast; out.playerB.F_final = FB.F_final;
    const pd10A = Number(playerA?.stats?.pointsSummary10?.diff)||0;
    const pd10B = Number(playerB?.stats?.pointsSummary10?.diff)||0;
    const EXT_A = extFromPatterns(playerA?.patterns), EXT_B = extFromPatterns(playerB?.patterns);
    const STAB_A = clamp01(playerA?.stability||0); const STAB_B = clamp01(playerB?.stability||0);
    const h2hTot = Number(out?.h2h?.summary?.A?.total||0);
    const h2hA = Number(out?.h2h?.summary?.A?.wins||0); const h2hB = Number(out?.h2h?.summary?.B?.wins||0);
    const h2hScoreA = h2hTot>0 ? (h2hA/h2hTot) : 0.5; const h2hScoreB = h2hTot>0 ? (h2hB/h2hTot) : 0.5;
    const S_star = (Ff, pd10, EXT, STAB, h2h) => {
      let S = 0.35*clamp01(Ff) + 0.25*clamp01(pd10/50) + 0.15*clamp01(EXT/100) + 0.15*clamp01(STAB) + 0.10*clamp01(h2h);
      if (Math.abs(pd10) > 40) S *= 0.8;
      return clamp01(S);
    };
    out.playerA.S_star = S_star(FA.F_final, pd10A, EXT_A, STAB_A, h2hScoreA);
    out.playerB.S_star = S_star(FB.F_final, pd10B, EXT_B, STAB_B, h2hScoreB);

    // Δ‑параметры и экспресс‑прогноз (для блока аналитики/графика)
    const dF = (FA.F_final - FB.F_final);
    const dS = (out.playerA.S_star - out.playerB.S_star);
    const dD = ((pd10A - pd10B)/50);
    const dT = ((EXT_A + STAB_A*100 - EXT_B - STAB_B*100)/200);
    const betaNew = { b0:0, b1:2.3, b2:1.7, b3:0.9, b4:1.1 };
    const zNew = betaNew.b0 + betaNew.b1*dF + betaNew.b2*dS + betaNew.b3*dD + betaNew.b4*dT;
    out.winProbNewA = 1/(1+Math.exp(-zNew));
    if (typeof btInfo?.p_match === 'number') {
      out.bt_p_match = btInfo.p_match;
      out.bt_favorite = btInfo.p_match >= 0.5 ? left : right;
    }
  } catch(_) {}
  // Flatten H2H summary into player fields for popup main table
  try {
    const aw = out.h2h?.summary?.A?.wins || 0;
    const at = out.h2h?.summary?.A?.total || 0;
    const bw = out.h2h?.summary?.B?.wins || 0;
    playerA.h2h = `${aw}-${bw}`;
    playerB.h2h = `${bw}-${aw}`;
  } catch(_) {}

  // --------- Forecast by logistic model using features from last 10 and H2H ---------
  function computeWeightedFeatures(arr, alpha = 0.85) {
    const L = (arr || []).slice(0, 10); // last 10
    const n = L.length;
    if (!n) return { F: 0, S: 0, D: 0, T: 0, setsTotal: 0 };
    let winsW = 0, lossesW = 0;
    let setsWinW = 0, setsLossW = 0, setsTotW = 0;
    let ptsDiffW = 0, ptsTotCountW = 0, tightCntW = 0;
    for (let i = 0; i < n; i++) {
      const m = L[i];
      const w = Math.pow(alpha, n - 1 - i);
      const em = enrichMatch(m);
      winsW += w * (em.win ? 1 : 0);
      lossesW += w * (em.win ? 0 : 1);
      setsWinW += w * em.ownSets;
      setsLossW += w * em.oppSets;
      const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
      for (const [a, b] of sets) {
        const ad = Number(a)||0, bd = Number(b)||0;
        ptsDiffW += w * (ad - bd);
        ptsTotCountW += w * 1; // по сетам — считаем количество сетов
        if (Math.abs(ad - bd) <= 2) tightCntW += w * 1;
      }
      setsTotW += w * (em.ownSets + em.oppSets);
    }
    const F = (winsW + lossesW) > 0 ? (winsW - lossesW) / (winsW + lossesW) : 0;
    const S = setsTotW > 0 ? (setsWinW - setsLossW) / setsTotW : 0;
    const D = ptsTotCountW > 0 ? (ptsDiffW / ptsTotCountW) / 11 : 0; // нормируем на ~11 очков/сет
    const T = ptsTotCountW > 0 ? (tightCntW / ptsTotCountW) : 0;
    return { F: Math.max(-1, Math.min(1, F)), S: Math.max(-1, Math.min(1, S)), D: Math.max(-1, Math.min(1, D)), T: Math.max(-1, Math.min(1, T)), setsTotal: setsTotW };
  }

  try {
    // Features for recents (A/B)
    const featA = computeWeightedFeatures(recA);
    const featB = computeWeightedFeatures(recB);
    // Features for H2H (oriented arrays)
    const h2hFeatA = computeWeightedFeatures(h2hA);
    const h2hFeatB = computeWeightedFeatures(h2hB);
    const dF = (featA.F - featB.F);
    const dS = (featA.S - featB.S);
    const dD = (featA.D - featB.D);
    const dT = (featA.T - featB.T);
    const dFh = (h2hFeatA.F - h2hFeatB.F) || 0;
    const dSh = (h2hFeatA.S - h2hFeatB.S) || 0;
    const dDh = (h2hFeatA.D - h2hFeatB.D) || 0;
    const dTh = (h2hFeatA.T - h2hFeatB.T) || 0;
    const beta = { b0: 0.0, b1: 2.0, b2: 1.5, b3: 0.4, b4: -0.8, g1: 1.5, g2: 1.0, g3: 0.3, g4: -0.5 };
    const z = beta.b0 + beta.b1*dF + beta.b2*dS + beta.b3*dD + beta.b4*dT + beta.g1*dFh + beta.g2*dSh + beta.g3*dDh + beta.g4*dTh;
    const pRaw = 1/(1+Math.exp(-z));
    // Conservative calibration: temperature, shrink to 0.5 and clipping by data volume
    const setsVol = Math.max(0, Math.min(1, (featA.setsTotal + featB.setsTotal) / 40)); // up to ~40 сетов
    const h2hVol = Math.max(0, Math.min(1, ((h2hFeatA.setsTotal||0) + (h2hFeatB.setsTotal||0)) / 20));
    const tau = 2.0 - 0.6*setsVol - 0.3*h2hVol; // more data → lower temperature (sharper)
    const shrink = 0.65 + 0.15*(setsVol + 0.5*h2hVol); // 0.65..0.95
    const clipLo = 0.22 - 0.04*(setsVol + 0.5*h2hVol); // 0.22..~0.18
    const clipHi = 1 - clipLo;
    const pTemp = 1/(1+Math.exp(-(z/Math.max(1e-6,tau))));
    let pCal = 0.5 + shrink*(pTemp - 0.5);
    pCal = Math.max(clipLo, Math.min(clipHi, pCal));
    const pA = pCal;
    out.forecast = {
      pA,
      pB: 1-pA,
      z,
      alpha: 0.85,
      deltas: { dF, dS, dD, dT, dFh, dSh, dDh, dTh },
      A: featA,
      B: featB,
      h2hA: h2hFeatA,
      h2hB: h2hFeatB,
      beta
    };
  } catch(_) {}
  // Enrich with non-BT probabilities and simple beta forecast
  try { computeNonBTProbabilities(out); } catch(_) {}
  try { buildSimpleBeta(out); } catch(_) {}

  // Meta-calibration (Winner + TB3.5) — optional coupling layer
  try {
    const getPct = (v,def=null)=> (typeof v==='number'? v : (v!=null? Number(v): def));
    const P10_no   = getPct(out?.playerA?.nonBTProbability10, null);
    const P5_no    = getPct(out?.playerA?.nonBTProbability5,  null);
    const P3_no    = getPct(out?.playerA?.nonBTProbability3,  null);
    const P10_with = getPct(out?.playerA?.nonBTProbability10_h2h, null);
    const P5_with  = getPct(out?.playerA?.nonBTProbability5_h2h,  null);
    const P3_with  = getPct(out?.playerA?.nonBTProbability3_h2h,  null);
    const to01 = (x)=> (typeof x==='number'? x/100 : null);
    const x = {
      P10_no: to01(P10_no) ?? 0.5,
      P5_no:  to01(P5_no)  ?? 0.5,
      P3_no:  to01(P3_no)  ?? 0.5,
      P10_with: to01(P10_with) ?? undefined,
      P5_with:  to01(P5_with)  ?? undefined,
      P3_with:  to01(P3_with)  ?? undefined,
      EXT_A: (()=>{ try{ const p=out?.playerA?.patterns; if(!p) return null; const C1=1-((p.loss_after_2_1_obj?.rate)||0); const C2=1-((p.loss_after_two_set_run?.rate)||0); const C3=1-((p.tiebreak_losses?.rate)||0); const C4=(p.decisive_fifth_wins?.rate)||(p.win_at_2_2?.rate)||0; return Math.round(100*(0.30*C1+0.30*C2+0.20*C3+0.20*C4)); }catch(_){ return null; } })(),
      EXT_B: (()=>{ try{ const p=out?.playerB?.patterns; if(!p) return null; const C1=1-((p.loss_after_2_1_obj?.rate)||0); const C2=1-((p.loss_after_two_set_run?.rate)||0); const C3=1-((p.tiebreak_losses?.rate)||0); const C4=(p.decisive_fifth_wins?.rate)||(p.win_at_2_2?.rate)||0; return Math.round(100*(0.30*C1+0.30*C2+0.20*C3+0.20*C4)); }catch(_){ return null; } })(),
      STAB_A: Math.round(100 * (out?.playerA?.stability ?? 0.5)),
      STAB_B: Math.round(100 * (out?.playerB?.stability ?? 0.5)),
      Sgap: (function(){
        const sA = (typeof out?.playerA?.effStrength==='number'? out.playerA.effStrength : out?.playerA?.mainStrength);
        const sB = (typeof out?.playerB?.effStrength==='number'? out.playerB.effStrength : out?.playerB?.mainStrength);
        const toS=(v)=> (typeof v==='number'? Math.max(-1, Math.min(1, (v-50)/50)) : 0);
        return toS(sA) - toS(sB);
      })(),
      H2H: out?.forecast?.dSh ?? 0,
      TopScore_3_2: +(out?.bt?.dist?.['3:2'] || 0),
      TopScore_2_3: +(out?.bt?.dist?.['2:3'] || 0),
      TopScore_3_0: +(out?.bt?.dist?.['3:0'] || 0),
      TopScore_0_3: +(out?.bt?.dist?.['0:3'] || 0),
      CoinFlip: (function(){ const p=to01(P10_no); return (p!=null? (p>=0.47 && p<=0.53) : false); })(),
      UpsetRadar: (function(){ try{ const dF=out?.forecast; if(!dF) return false; const c1=((to01(P10_no)||0.5)<=0.60 && (to01(P10_no)||0.5)>=0.40 && (dF.pA||0.5)>=0.80); const c2=false; return (c1?1:0)+(c2?1:0) >= 2; }catch(_){ return false;} })()
    };
    // TB features
    try {
      const recA = Array.isArray(out.recentsA10)? out.recentsA10 : [];
      const recB = Array.isArray(out.recentsB10)? out.recentsB10 : [];
      let tb=0,tot=0,long=0,totm=0,dry=0,skew=0;
      const visit=(arr)=>{
        for (const m of arr){
          const sets = Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent : [];
          if (sets.length){ totm++; if (sets.length>=4) long++; }
          let own=0,opp=0; for (const [a,b] of sets){ const aa=Number(a)||0, bb=Number(b)||0; if (aa>=10 && bb>=10) tb++; tot++; own+=aa; opp+=bb; }
          const fo = m.finalScoreOwnOpponent; if (fo){ const a=Number(fo.own)||0,b=Number(fo.opponent)||0; if ((a===3&&b===0)||(a===0&&b===3)) dry++; }
          skew += (own - opp);
        }
      };
      visit(recA); visit(recB);
      x.TieBreakRate_pair = (tot>0? tb/tot : 0);
      x.FracSets4_5_pair  = (totm>0? long/totm : 0);
      x.DryRate_pair      = (totm>0? dry/totm : 0);
      x.RecentSweep       = (function(){ const has=(arr)=>{ const L=(arr||[]).slice(0,2); for(const m of L){ const fo=m?.finalScoreOwnOpponent; const a=Number(fo?.own)||0,b=Number(fo?.opponent)||0; if((a===3&&b===0)||(a===0&&b===3)) return true;} return false;}; return (has(recA)||has(recB)); })();
      x.ScoreSkew         = (tot>0? (skew/Math.max(1,tot)) : 0);
    } catch(_){}
    if (window.MetaCalib && typeof window.MetaCalib.predictWinnerAndTB==='function'){
      const meta = window.MetaCalib.loadMetaParams?.();
      const res = window.MetaCalib.predictWinnerAndTB(x, meta);
      out.meta = { winner_tb35: res, features: x };
    }
  } catch(_) {}
  return out;
}

function buildPlayerFromRecent(name, matches) {
  // Only consider matches with normalized sets for this player
  const ownMatches = (matches || []).filter((m) => Array.isArray(m.setsOwnOpponent) && m.finalScoreOwnOpponent);
  const pat = buildPatternObjectsFromMatches(ownMatches);
  const stability = computeStabilityFromPatterns(pat);
  return {
    name,
    patterns: pat,
    stability
  };
}

// --- Non-BT probability and simple beta forecast ---
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function computeNonBTProbabilities(data) {
  try {
    // Helpers
    const clamp01 = (x)=> Math.max(0, Math.min(1, Number(x)||0));
    const okScore = (v)=> (v!=null && !isNaN(Number(v)));
    const safeSets = (m)=> Array.isArray(m?.setsOwnOpponent) ? m.setsOwnOpponent : [];

    // Extract oriented recents (up to last 10 as provided)
    const recA10 = Array.isArray(data.recentsA10) ? data.recentsA10 : [];
    const recB10 = Array.isArray(data.recentsB10) ? data.recentsB10 : [];

    // Compute M,S,D,T with Laplace priors from raw scores only
    const computeMSDT = (rec) => {
      let matchWins=0, matchLosses=0;
      let setWins=0, setLosses=0;
      let decWins=0, decLosses=0, decTotal=0;
      let tbWins=0, tbLosses=0, tbTotal=0;
      for (const m of rec) {
        const fo = m?.finalScoreOwnOpponent;
        const sets = safeSets(m);
        if (okScore(fo?.own) && okScore(fo?.opponent)) {
          if (Number(fo.own) > Number(fo.opponent)) matchWins++; else matchLosses++;
        }
        for (let i=0;i<sets.length;i++) {
          const a = Number(sets[i]?.[0]) || 0; const b = Number(sets[i]?.[1]) || 0;
          if (a>b) setWins++; else if (b>a) setLosses++;
          if (a>=10 && b>=10) { // tie-breaky ends per spec
            tbTotal++;
            if (a>b) tbWins++; else if (b>a) tbLosses++;
          }
        }
        // Decider: only for maximum distance matches (bo3→3 sets, bo5→5 sets)
        if (sets.length===3 || sets.length===5) {
          const la = Number(sets[sets.length-1]?.[0]) || 0;
          const lb = Number(sets[sets.length-1]?.[1]) || 0;
          decTotal++;
          if (la>lb) decWins++; else if (lb>la) decLosses++;
        }
      }
      // Laplace smoothing priors
      const priorM=1, priorS=2, priorD=1, priorT=1;
      const M = (matchWins + priorM) / (matchWins + matchLosses + 2*priorM);
      const S = (setWins   + priorS) / (setWins   + setLosses   + 2*priorS);
      const D = decTotal>0 ? ((decWins + priorD) / (decWins + decLosses + 2*priorD)) : 0.5;
      const T = tbTotal>0 ? ((tbWins + priorT) / (tbWins + tbLosses + 2*priorT)) : 0.5;
      return { M, S, D, T, nMatches: (matchWins+matchLosses) };
    };

    const computeProbAndK = (arrA, arrB) => {
      const A = computeMSDT(arrA);
      const B = computeMSDT(arrB);
      const wM=0.40, wS=0.30, wD=0.20, wT=0.10;
      const scoreA = wM*A.M + wS*A.S + wD*A.D + wT*A.T;
      const scoreB = wM*B.M + wS*B.S + wD*B.D + wT*B.T;
      const d = scoreA - scoreB;
      const effN = Math.min((A.nMatches||0) + (B.nMatches||0), 20);
      const k = 5.5 * (0.5 + 0.5 * (effN/20));
      const pA_raw = 1 / (1 + Math.exp(-k * d));
      const p = clamp01(Math.max(0.01, Math.min(0.99, pA_raw)));
      return { p, k, d };
    };

    // 10, 5, 3 последних игр
    const base10 = computeProbAndK(recA10, recB10);
    const base5  = computeProbAndK(recA10.slice(0,5), recB10.slice(0,5));
    const base3  = computeProbAndK(recA10.slice(0,3), recB10.slice(0,3));
    const pA10 = base10.p;
    const pA5  = base5.p;
    const pA3  = base3.p;

    // Backward-compatible fields (keep original meaning = last 10)
    data.playerA.nonBTProbability = +(pA10*100).toFixed(1);
    data.playerB.nonBTProbability = +((1-pA10)*100).toFixed(1);
    // Explicit windowed fields
    data.playerA.nonBTProbability10 = +(pA10*100).toFixed(1);
    data.playerB.nonBTProbability10 = +((1-pA10)*100).toFixed(1);
    data.playerA.nonBTProbability5  = +(pA5*100).toFixed(1);
    data.playerB.nonBTProbability5  = +((1-pA5)*100).toFixed(1);
    data.playerA.nonBTProbability3  = +(pA3*100).toFixed(1);
    data.playerB.nonBTProbability3  = +((1-pA3)*100).toFixed(1);

    // Also compute optional variant with H2H influence (strictly set scores only)
    try {
      const hA = Array.isArray(data.h2hOrientedA) ? data.h2hOrientedA : [];
      const hB = Array.isArray(data.h2hOrientedB) ? data.h2hOrientedB : [];
      // Count oriented for A and B separately
      const sumH = (arr)=>{
        let mW=0, mL=0, sW=0, sL=0;
        for (const m of arr) {
          const fo = m?.finalScoreOwnOpponent; if (okScore(fo?.own) && okScore(fo?.opponent)) { if (fo.own>fo.opponent) mW++; else mL++; }
          const sets = safeSets(m); for (const [a0,b0] of sets) { const a=Number(a0)||0, b=Number(b0)||0; if (a>b) sW++; else if (b>a) sL++; }
        }
        return { mW, mL, sW, sL, n: mW+mL };
      };
      const HA = sumH(hA);
      const HB = sumH(hB);
      const nH = Math.max(HA.n, HB.n);
      const hM = (HA.mW + 1) / (HA.mW + HB.mW + 2);
      const hS = (HA.sW + 2) / (HA.sW + HB.sW + 4);
      const H2Hraw = 0.6*hM + 0.4*hS;
      const H2Hdiff = H2Hraw - 0.5; // symmetric [-0.5..+0.5]
      const confH = Math.min(1, nH / 6);
      const wH = 0.6 * confH;
      // Blend per-window via logit shift: logit(p) + k*wH*H2Hdiff
      const logit = (p)=> Math.log(p/(1-p));
      const sigm = (x)=> 1/(1+Math.exp(-x));
      const p10_h2h = clamp01(sigm(logit(base10.p) + base10.k * wH * H2Hdiff));
      const p5_h2h  = clamp01(sigm(logit(base5.p)  + base5.k  * wH * H2Hdiff));
      const p3_h2h  = clamp01(sigm(logit(base3.p)  + base3.k  * wH * H2Hdiff));
      data.playerA.nonBTProbability10_h2h = +(p10_h2h*100).toFixed(1);
      data.playerB.nonBTProbability10_h2h = +((1-p10_h2h)*100).toFixed(1);
      data.playerA.nonBTProbability5_h2h  = +(p5_h2h*100).toFixed(1);
      data.playerB.nonBTProbability5_h2h  = +((1-p5_h2h)*100).toFixed(1);
      data.playerA.nonBTProbability3_h2h  = +(p3_h2h*100).toFixed(1);
      data.playerB.nonBTProbability3_h2h  = +((1-p3_h2h)*100).toFixed(1);
    } catch(_) { /* optional */ }
  } catch(_){ /* noop */ }
}

function buildSimpleBeta(data) {
  try {
    const A = data.playerA || {}; const B = data.playerB || {};
      const pA = (typeof A.nonBTProbability === 'number') ? (A.nonBTProbability/100) : 0.5;
    const favName = pA >= 0.5 ? (A.name||'Игрок 1') : (B.name||'Игрок 2');
    const favProb = pA >= 0.5 ? pA : (1-pA);

    // Confidence from signal strength and data volume
    const stabA = (typeof A.stability === 'number') ? A.stability : 0.5;
    const stabB = (typeof B.stability === 'number') ? B.stability : 0.5;
    const edge = Math.abs(pA-0.5);
    let conf = 45 + Math.round(40*edge);
    const h2hTotal = data.h2h?.total || 0; if (h2hTotal < 3) conf -= 6; if (h2hTotal > 7) conf += 4;
    const stabGap = Math.abs(stabA - stabB); if (stabGap < 0.08) conf -= 4; if (stabGap > 0.20) conf += 4;
    conf = Math.max(5, Math.min(95, conf));
    const confLevel = conf>=70?'high':(conf>=45?'medium':'low');
    const confEmoji = confLevel==='high'?'🟢':(confLevel==='medium'?'🟡':'🔴');

    // Factors
    const factorsForA = [];
    const factorsForB = [];
    const add = (toA, label, note) => { (toA?factorsForA:factorsForB).push({ label, note }); };
    const strA = A.mainStrength, strB = B.mainStrength;
    if (typeof strA==='number' && typeof strB==='number') {
      const d=strA-strB; if (Math.abs(d)>=5) add(d>0, 'Сила выше', `${strA} vs ${strB}`);
    }
    if (typeof A.stability==='number' && typeof B.stability==='number'){
      const a=Math.round(A.stability*100), b=Math.round(B.stability*100);
      const d=a-b; if (Math.abs(d)>=8) add(d>0,'Стабильность выше',`${a}% vs ${b}%`);
    }
    const srA = (A.sets&&A.sets.totalSets>0)?Math.round(100*A.sets.totalWins/A.sets.totalSets):null;
    const srB = (B.sets&&B.sets.totalSets>0)?Math.round(100*B.sets.totalWins/B.sets.totalSets):null;
    if (srA!=null && srB!=null){ const d=srA-srB; if (Math.abs(d)>=8) add(d>0,'Доля выигранных сетов',`${srA}% vs ${srB}%`); }
    const hwA = data.h2h?.summary?.A?.wins||0; const hwB = data.h2h?.summary?.B?.wins||0; const ht = data.h2h?.summary?.A?.total||0; if (ht>0){ const d=hwA-hwB; if (Math.abs(d)>=2) add(d>0,'Преимущество H2H',`${hwA}-${hwB}`); }
    try {
      const pApts = data.playerA?.stats?.scorePoints10?.totalPoints; const pBpts = data.playerB?.stats?.scorePoints10?.totalPoints; if (typeof pApts==='number' && typeof pBpts==='number'){ const d=pApts-pBpts; if (Math.abs(d)>=6) add(d>0,'Очки (10 игр)', `${pApts>=0?'+':''}${pApts} vs ${pBpts>=0?'+':''}${pBpts}`); }
    } catch(_){}

    data.beta = {
      favorite: favName,
      favoriteProb: favProb,
      confidence: { score: conf, level: confLevel, emoji: confEmoji },
      factorsForA,
      factorsForB,
      warnings: []
    };
  } catch(_){ /* noop */ }
}

function buildPatternObjectsFromMatches(matches) {
  let w10 = 0, d10 = 0; // win after 1:0
  let w01 = 0, d01 = 0; // win after 0:1
  let loss21 = 0, d21 = 0; // loss after 2:1 lead
  let w12 = 0, d12 = 0; // win after 1:2 down
  let w2run = 0, d2run = 0; // wins when has two consecutive set wins at any point
  let w22 = 0, d22 = 0; // win at 2:2 into 5th set
  let w02 = 0, d02 = 0; // win after 0:2 down (первые два сета проиграны)
  let w2down = 0, d2down = 0; // win after any two consecutive lost sets (в любом месте матча)
  let tbLoss = 0, tbTot = 0; // tiebreak losses per set

  for (const m of matches) {
    const sets = m.setsOwnOpponent || [];
    const ownWon = (m.finalScoreOwnOpponent?.own ?? 0) > (m.finalScoreOwnOpponent?.opponent ?? 0);

    if (sets.length >= 1) {
      const wonFirst = sets[0][0] > sets[0][1];
      const lostFirst = sets[0][0] < sets[0][1];
      if (wonFirst) { d10++; if (ownWon) w10++; }
      if (lostFirst) { d01++; if (ownWon) w01++; }
    }

    if (sets.length >= 3) {
      // after 3 sets
      let a3 = 0, b3 = 0;
      for (let i = 0; i < 3; i++) {
        if (sets[i][0] > sets[i][1]) a3++; else if (sets[i][0] < sets[i][1]) b3++;
      }
      if (a3 === 2 && b3 === 1) { d21++; if (!ownWon) loss21++; }
      if (a3 === 1 && b3 === 2) { d12++; if (ownWon) w12++; }
    }

    // two consecutive own set wins anywhere
    let has2 = false;
    for (let i = 1; i < sets.length; i++) {
      if (sets[i][0] > sets[i][1] && sets[i - 1][0] > sets[i - 1][1]) { has2 = true; break; }
    }
    if (has2) { d2run++; if (ownWon) w2run++; }

    if (sets.length >= 5) {
      let a4 = 0, b4 = 0;
      for (let i = 0; i < 4; i++) {
        if (sets[i][0] > sets[i][1]) a4++; else if (sets[i][0] < sets[i][1]) b4++;
      }
      if (a4 === 2 && b4 === 2) { d22++; if (ownWon) w22++; }
    }

    if (sets.length >= 2) {
      const down02 = sets[0][0] < sets[0][1] && sets[1][0] < sets[1][1];
      if (down02) { d02++; if (ownWon) w02++; }
    }

    // Two consecutive lost sets anywhere in the match
    if (sets.length >= 2) {
      let has2LossStreak = false;
      for (let i = 1; i < sets.length; i++) {
        if (sets[i][0] < sets[i][1] && sets[i - 1][0] < sets[i - 1][1]) { has2LossStreak = true; break; }
      }
      if (has2LossStreak) { d2down++; if (ownWon) w2down++; }
    }

    for (const [a, b] of sets) {
      if (isExtraPointsSet(a, b)) { tbTot++; if (a < b) tbLoss++; }
    }
  }

  const frac = (wins, total) => (total > 0 ? (wins / total) : null);
  const makeRate = (wins, total) => (total > 0 ? { wins, total, rate: wins / total } : { wins: 0, total: 0, rate: null });
  const makeLossRate = (losses, total) => (total > 0 ? { losses, total, rate: losses / total } : { losses: 0, total: 0, rate: null });

  return {
    win_after_1_0: makeRate(w10, d10),
    win_after_0_1: makeRate(w01, d01),
    loss_after_2_1_obj: makeLossRate(loss21, d21),
    win_after_1_2: makeRate(w12, d12),
    win_two_set_run: makeRate(w2run, d2run),
    // New: losses after having a two-set winning streak at any point in match
    loss_after_two_set_run: (d2run > 0 ? { losses: (d2run - w2run), total: d2run, rate: (d2run - w2run) / d2run } : { losses: 0, total: 0, rate: null }),
    win_at_2_2: makeRate(w22, d22),
    decisive_fifth_wins: makeRate(w22, d22),
    come_from_0_2_win: makeRate(w02, d02),
    come_from_two_set_down: makeRate(w2down, d2down),
    tiebreak_losses: (tbTot > 0 ? { losses: tbLoss, total: tbTot, rate: tbLoss / tbTot } : { losses: 0, total: 0, rate: null })
  };
}

function computeStabilityFromPatterns(p) {
  // StabilityPro (0..1) по новой схеме: штрафуем плохие паттерны, мягко поощряем камбэк 1:2
  if (!p) return null;
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x)||0));
  const smoothedRate = (wins, losses, prior=1) => {
    const w = Math.max(0, Number(wins)||0), l = Math.max(0, Number(losses)||0);
    return (w + prior) / (w + l + 2*prior);
  };
  const getRate = (obj, {preferLoss=false}={}) => {
    if (!obj) return {r:null, n:0};
    const total = Number(obj.total||0);
    let r = (typeof obj.rate==='number') ? obj.rate : null;
    if (r==null && total>0) {
      const w = Number(preferLoss? obj.losses||0 : obj.wins||0);
      r = w / Math.max(1,total);
    }
    if (total > 0 && total <= 2) {
      const w = Number(preferLoss? obj.losses||0 : obj.wins||0);
      const l = Math.max(0, total - w);
      r = smoothedRate(w, l, 1);
    }
    return { r: (r==null? null : clamp01(r)), n: total };
  };
  // r1..r5
  const r1 = getRate(p.tiebreak_losses, {preferLoss:true});                 // FailTB
  const r2 = getRate(p.loss_after_2_1_obj, {preferLoss:true});              // Lead21Loss
  const r3 = getRate(p.loss_after_two_set_run, {preferLoss:true});          // Run2WLose
  const r5 = getRate(p.win_after_1_2, {preferLoss:false});                  // Comeback12Win (успех)
  const d5 = getRate(p.decisive_fifth_wins ?? p.win_at_2_2, {preferLoss:false});
  const r4 = { r: (d5.r==null? null : (1 - d5.r)), n: d5.n };               // FailDecider

  // Применяем веса
  const badParts = [ {r:r1.r, n:r1.n, w:0.32}, {r:r2.r, n:r2.n, w:0.28}, {r:r3.r, n:r3.n, w:0.20}, {r:r4.r, n:r4.n, w:0.12} ];
  const goodParts = [ {r:r5.r, n:r5.n, w:0.08} ];

  // Исключаем отсутствующие; если n<=2, уменьшаем вес до 35%
  const effBad = badParts.filter(x=>x.r!=null).map(x=> ({v: x.r, w: x.w * (x.n>0 && x.n<=2 ? 0.35 : 1)}));
  const effGood = goodParts.filter(x=>x.r!=null).map(x=> ({v: x.r, w: x.w * (x.n>0 && x.n<=2 ? 0.35 : 1)}));
  if (!effBad.length && !effGood.length) return null;
  const bad = effBad.reduce((s,t)=> s + t.v * t.w, 0);
  const good = effGood.reduce((s,t)=> s + t.v * t.w, 0);
  const score = clamp01(1 - bad + 0.5*good);
  return score;
}
