// Idempotent content script wrapper to avoid redeclarations on reinjection
(function(){
  if (typeof window !== 'undefined') {
    if (window.__TSX_CONTENT_LOADED__) return; // already loaded
    window.__TSX_CONTENT_LOADED__ = true;
    // Also mark in DOM so page-world can detect from Playwright
    try { if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-tsx-content-loaded', '1');
    } } catch(_) {}
    // Perf mode flags (server-friendly throttling)
    try {
      const perf = String(localStorage.getItem('__TSX_PERF')||'').toLowerCase();
      if (perf === 'server') window.__TSX_SERVER_MODE__ = true;
    } catch(_) {}
  }

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

// (Удалено) Decision Summary block — по просьбе пользователя

// --- Core verdict function (≥2 sets) v4 ---
/*
🧭 PROMPT: Расчёт прогноза на “фаворит возьмёт ≥ 2 сета”

Вход: p_no_bt_3, p_logistic_3, fci, trend_delta, p_strength_3, sum_agree, markov_topset.

Алгоритм:
  score =
    0.25 * p_no_bt_3 +
    0.30 * p_logistic_3 +
    0.20 * fci +
    0.10 * (trend_delta/100) +
    0.10 * p_strength_3 +
    0.05 * markov;

Коррекции:
  - диссонанс: если (p_no_bt_3>0.60 && p_logistic_3<0.45) или (p_no_bt_3<0.45 && p_logистическая_3>0.60) → −0.10
  - слабое согласие: если sum_agree < 0.50 → −0.05
  - марков-топ: +0.04 для {3:0,3:1,3:2}, −0.06 для {0:3,1:3,2:3}

Вердикт (Fav режим):
  ≥0.72 → ✅ GO; 0.60–0.71 → 🟢 MID; 0.55–0.59 → 🟡 RISK; <0.55 → 🔴 PASS.

Анти‑режим (Und +1.5):
  Строим отдельный UndScore:
    UndScore = 0.30*(1-p_log3) + 0.25*(1-p_no3) + 0.15*(1-fci) + 0.10*(-trend) + 0.10*(1-p_str3) + 0.10*markov_pen,
    где markov_pen = +0.06 для {0:3,1:3,2:3}, −0.04 для {3:0,3:1,3:2}.
  Пороги: ≥0.72 → ✅ GO(+1.5); 0.60–0.71 → 🟢 MID(+1.5); иначе — пропуск.

Приоритет вывода:
  - Если FavScore ≥0.60 и UndScore ≥0.60 → 🟡 NEUTRAL (пропуск)
  - Иначе если FavScore ≥0.60 → Fav ≥2
  - Иначе если FavScore < 0.55 и UndScore ≥0.60 → Und +1.5
  - Иначе 🔴 PASS

Quality‑гейты:
  - Если p_log3<0.40 и p_no3<0.45 → запрет Fav ≥2
  - Если sum_agree<0.40 → всё в PASS
  - Если markov_topset==='0:3' и p_log3≤0.45 → анти‑приоритет
*/
function computeTwoSetsVerdict_v4(data){
  const clamp01 = (x)=> Math.max(0, Math.min(1, x));
  const norm = (v)=> (typeof v === 'number' && isFinite(v)) ? clamp01(v/100) : 0;
  const trend = (typeof data?.trend_delta === 'number' && isFinite(data.trend_delta)) ? (data.trend_delta/100) : 0;

  const pNo = norm(data?.p_no_bt_3);
  const pLog = norm(data?.p_logistic_3);
  // If dedicated strength_3 is missing, use p_no_bt_3 as a proxy (short window strength)
  const pStr = (typeof data?.p_strength_3 === 'number') ? norm(data.p_strength_3) : pNo;
  const fci = norm(data?.fci);
  const agree = (typeof data?.sum_agree === 'number' && isFinite(data.sum_agree)) ? clamp01(data.sum_agree/100) : null;
  const markovScore = norm((typeof data?.markov_score === 'number') ? data.markov_score : 50);

  // Base score per spec
  let favScore = (
    0.25 * pNo +
    0.30 * pLog +
    0.20 * fci +
    0.10 * trend +
    0.10 * pStr +
    0.05 * markovScore
  );

  // Markov top-set adjustment
  const top = String(data?.markov_topset||'');
  if (['3:0','3:1','3:2'].includes(top)) favScore += 0.04;
  if (['0:3','1:3','2:3'].includes(top)) favScore -= 0.06;

  // Dissonance penalty
  const dissonance = ((pNo > 0.6 && pLog < 0.45) || (pNo < 0.45 && pLog > 0.6));
  if (dissonance) favScore -= 0.10;

  // Weak agreement penalty
  if (agree != null && agree < 0.50) favScore -= 0.05;

  // Quality gates
  const forbidFav = ((pLog < 0.40) && (pNo < 0.45));
  const chaosAllPass = (agree != null && agree < 0.40);
  const antiPriority = (top === '0:3' && pLog <= 0.45);

  favScore = clamp01(favScore);
  if (forbidFav) favScore = Math.min(favScore, 0.54); // keep below Fav threshold
  if (chaosAllPass) favScore = 0; // force PASS

  // Underdog +1.5 score
  const pNo_u = 1 - pNo;
  const pLog_u = 1 - pLog;
  const pStr_u = 1 - pStr;
  const fci_u = 1 - fci;
  let undScore = (
    0.30 * pLog_u +
    0.25 * pNo_u +
    0.15 * fci_u +
    0.10 * (-trend) +
    0.10 * pStr_u +
    0.10 * ( ['0:3','1:3','2:3'].includes(top) ? 0.06 : (['3:0','3:1','3:2'].includes(top) ? -0.04 : 0) )
  );
  if (dissonance) undScore += 0.05;
  if (agree != null && agree < 0.45) undScore += 0.05;
  if (chaosAllPass) undScore = 0; // force PASS in chaos
  undScore = clamp01(undScore);

  let verdict, confidence;
  let mode = 'Neutral/Pass';
  let score01 = favScore;
  // Conflict check
  const favOK = (favScore >= 0.60);
  const undOK = (undScore >= 0.60);
  if (favOK && undOK) {
    verdict = '🟡 NEUTRAL'; confidence = 'пропуск'; mode = 'Neutral/Pass'; score01 = Math.max(favScore, undScore);
  } else if (favOK) {
    if (favScore >= 0.72) { verdict = '✅ GO'; confidence = '≥2 сета ~90–95%'; }
    else { verdict = '🟢 MID'; confidence = '≥2 сета ~75–85%'; }
    mode = 'Fav ≥2'; score01 = favScore;
  } else if ((favScore < 0.55 && undOK) || (antiPriority && undOK)) {
    if (undScore >= 0.72) { verdict = '✅ GO(+1.5)'; confidence = '≈85–90%'; }
    else { verdict = '🟢 MID(+1.5)'; confidence = '≈75–85%'; }
    mode = 'Underdog +1.5'; score01 = undScore;
  } else if (favScore >= 0.55 && favScore < 0.60) {
    verdict = '🟡 RISK'; confidence = '55–65%'; mode = 'Neutral/Pass'; score01 = favScore;
  } else {
    verdict = '🔴 PASS'; confidence = '<50%'; mode = 'Neutral/Pass'; score01 = Math.max(favScore, undScore);
  }

  return { score01, scorePct: +(score01*100).toFixed(1), verdict, confidence, favScore, undScore, mode };
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
  // Логистическая (3): считаем выполненной, если вероятность фаворита по логистике ≥ 55%
  const passMl3   = ok(mlFav3) && mlFav3 >= 55;
  const mlRed     = ok(ml3Diff)   ? (ml3Diff < 0) : false; // красная логистика

  // Background (10-game) context
  const p10Fav = Number(fav?.p10 ?? NaN);
  const p10Opp = Number(opp?.p10 ?? NaN);

  // Shock against favorite: opponent rising sharply or favorite dropping sharply
  const d5_10_opp = Number(opp?.d5_10 ?? NaN);
  const d5_10_fav = Number(fav?.d5_10 ?? NaN);
  const shockOpp = (ok(d5_10_opp) && d5_10_opp >= 15) || (ok(d5_10_fav) && d5_10_fav <= -15);

  const matched = [passNoBt3, passForm3, passMl3].filter(Boolean).length;

  // Build v4 verdict inputs (tolerant to missing fields)
  let fciFromUI = null;
  try {
    const mf = document.getElementById('mfTitle');
    const txt = mf ? (mf.innerText || mf.textContent || '') : '';
    const mm = String(txt).match(/FCI\s*:\s*(\d{1,3})%/i);
    if (mm) { const vv = Number(mm[1]); if (isFinite(vv)) fciFromUI = vv; }
  } catch(_) {}
  const v4in = {
    trend_delta: Number.isFinite(fav?.d3_5) ? fav.d3_5 : (Number.isFinite(fav?.d5_10) ? fav.d5_10 : 0),
    p_no_bt_3: Number.isFinite(fav?.p3) ? fav.p3 : undefined,
    p_logistic_3: Number.isFinite(mlFav3) ? mlFav3 : undefined,
    p_strength_3: Number.isFinite(fav?.p3) ? fav.p3 : undefined,
    fci: Number.isFinite(fciFromUI) ? fciFromUI : undefined,
    sum_agree: undefined,
    markov_score: undefined,
    markov_topset: undefined
  };
  const v4 = computeTwoSetsVerdict_v4(v4in);

  // ===== Final verdict per latest PROMPT (flags + unified score) =====
  // Try to enrich with SUM (committee) and Markov top-set from compare block if available
  let sumAgree = null, markovTop = null;
  try {
    const cEl = document.querySelector('.cmp-row.committee');
    if (cEl) {
      const tt = (cEl.innerText || cEl.textContent || '').replace(/\s+/g,' ').trim();
      const mc = tt.match(/комитет\s*\(калибр\.\)\s*:\s*(\d{1,3})%/i);
      if (mc) { const vv = Number(mc[1]); if (isFinite(vv)) sumAgree = vv; }
    }
  } catch(_) {}
  try {
    const mEl = document.querySelector('.cmp-row.mbt');
    if (mEl) {
      const tt = (mEl.innerText || mEl.textContent || '').replace(/\s+/g,' ').trim();
      const ms = tt.match(/Топ\s*[-–—]?\s*сч[её]т\s*:\s*([0-9:]+)/i);
      if (ms) markovTop = ms[1];
    }
  } catch(_) {}

  function computeFinalVerdict_v5(inp, names){
    const clamp01 = (x)=> Math.max(0, Math.min(1, x));
    const favName = names.favName||'Фаворит';
    const undName = names.undName||'Аутсайдер';
    // Try to read H2H(3) for favorite from nb3 row if not provided
    let prob_h2h = (typeof inp.p_h2h_3 === 'number') ? inp.p_h2h_3 : null;
    if (prob_h2h == null) {
      try {
        const nbFav = document.querySelector('.min2-compare .cmp-row.nb3 .fav.nb3');
        if (nbFav) {
          const t = (nbFav.innerText||nbFav.textContent||'');
          const m = t.match(/с\s*H2H\s*(\d{1,3})%/i);
          if (m) { const v = Number(m[1]); if (isFinite(v)) prob_h2h = v; }
        }
      } catch(_) {}
    }

    // Base (percent scale)
    const prob_noBT = Number.isFinite(inp.p_no_bt_3)? inp.p_no_bt_3 : 0;
    const prob_log  = Number.isFinite(inp.p_logistic_3)? inp.p_logistic_3 : 0;
    const prob_form = Number.isFinite(inp.p_strength_3)? inp.p_strength_3 : prob_noBT;
    const fci       = Number.isFinite(inp.fci)? inp.fci : 0;
    const sum       = Number.isFinite(inp.sum_agree)? inp.sum_agree : null;
    const trend     = Number.isFinite(inp.trend_delta)? inp.trend_delta : 0;
    const top       = String(inp.markov_topset||'');
    const p_h2h     = Number.isFinite(prob_h2h)? prob_h2h : 0;

    let base = 0
      + 0.28 * prob_noBT
      + 0.25 * prob_form
      + 0.22 * fci
      + 0.15 * p_h2h
      + 0.10 * prob_log;
    let adj = 0;
    // v5.4: SUM anomaly penalty — apply stronger and symmetric bounds
    if (sum != null && (sum < 50 || sum > 80)) adj -= 8; // -0.08
    if (trend < -10) adj -= 5;
    if (Math.abs(prob_noBT - prob_log) > 20) adj -= 5;
    if (['3:0','3:1','3:2'].includes(top)) adj += 4; else adj -= 6;
    let scorePct = Math.max(0, Math.min(100, base + adj));
    let score = scorePct / 100;

    // v5.4: Overrated favorite penalty (FCI high, SUM weak)
    if (fci > 70 && (sum != null && sum < 60)) {
      score = Math.max(0, score - 0.10);
    }

    // v5.4: Pseudo-3:0 correction
    if (top === '3:0' && score < 0.65) {
      score = Math.max(0, score - 0.07);
    }

    let badge = '🔴 PASS', color = '#a00', outScore = score, stakeName = '—', flag='—';
    // v5.4 thresholds
    if (score >= 0.72) { badge='✅ GO'; color='#059669'; stakeName=favName; flag='🏆'; }
    else if (score >= 0.60) { badge='🟢 MID'; color='#16a34a'; stakeName=favName; flag='🏆'; }
    else if (score >= 0.52) { badge='🟡 RISK'; color='#ca8a04'; stakeName=favName; flag='🏆'; }
    else {
      // Mirror mode — simple underdog signals
      let und_no = null, und_log = null;
      try {
        const nbOpp = document.querySelector('.min2-compare .cmp-row.nb3 .opp.nb3');
        if (nbOpp) {
          const t=(nbOpp.innerText||nbOpp.textContent||'');
          const m=t.match(/без\s*H2H\s*(\d{1,3})%/i); if (m) und_no = Number(m[1]);
        }
        const el=document.querySelector('.min2-compare .cmp-row.ml3 .opp.ml3');
        if (el) { const m=(el.innerText||el.textContent||'').match(/(\d{1,3})%/); if (m) und_log = Number(m[1]); }
      } catch(_) {}
      const hasSignal = ((und_no!=null && und_no>=60) || (und_log!=null && und_log>=55) || (trend<=-10));
      // v5.4: If SUM > 70 — it's not a flipped match; ignore mirror GO
      if (score < 0.45 && (sum != null && sum > 70)) { badge='🔴 PASS'; color='#a00'; stakeName='—'; flag='—'; }
      else if (score < 0.45 && hasSignal) { badge='🟢 GO'; color='#16a34a'; stakeName=undName; flag='🚩'; }
      else { badge='🔴 PASS'; color='#a00'; stakeName='—'; flag='—'; }
    }

    return { score: outScore, badge, color, flag, stakeName };
  }

  const favName = match?.favName || 'Фаворит';
  const oppName = match?.oppName || 'Аутсайдер';
  const v5 = computeFinalVerdict_v5({
    p_no_bt_3: Number.isFinite(fav?.p3) ? fav.p3 : undefined,
    p_logistic_3: Number.isFinite(mlFav3) ? mlFav3 : undefined,
    p_strength_3: Number.isFinite(fav?.p3) ? fav.p3 : undefined,
    fci: Number.isFinite(fciFromUI) ? fciFromUI : undefined,
    trend_delta: Number.isFinite(fav?.d3_5) ? fav.d3_5 : (Number.isFinite(fav?.d5_10) ? fav.d5_10 : 0),
    sum_agree: Number.isFinite(sumAgree) ? sumAgree : undefined,
    markov_topset: markovTop || undefined
  }, { favName, undName: oppName });

  let color = v5.color;
  const stakeStr = (v5.stakeName && v5.stakeName !== '—' && (v5.flag === '🏆' || v5.flag === '🚩'))
    ? `${v5.flag} ${v5.stakeName}`
    : 'Ставка: —';
  const header = `🎯 ${v5.score.toFixed(2)} | ${v5.badge} | ${stakeStr}`;

  // Values for compact extract block
  const favMl3Int = ok(mlFav3) ? Math.round(mlFav3) : null;
  const favMl3Str = ok(mlFav3) ? (Math.round(mlFav3 * 10) / 10).toFixed(1) + '%' : '—';
  const favIdx3Int = ok(fav?.p3) ? Math.round(Number(fav.p3)) : null;
  const dataFav = String(favName || '').replace(/"/g, '\"');
  const dataLog3 = favMl3Int != null ? ` data-log3="${favMl3Int}"` : '';
  const dataIdx3 = favIdx3Int != null ? ` data-idx3="${favIdx3Int}"` : '';

  return `
    <div class="take-two-sets" style="background:${color};color:#fff;display:block;width:100%;box-sizing:border-box;padding:12px 16px;border-radius:12px;font:600 14px/1.4 system-ui;margin:10px 0;">
      <div style="font-size:15px;">${header}</div>
      <div class="min2-extract" data-fav="${dataFav}"${dataLog3}${dataIdx3} style="margin-top:8px;border-top:1px solid rgba(255,255,255,.35);padding-top:6px;">
        <div>Фаворит ${favName}</div>
        <div class="min2-log3">${favMl3Str}</div>
        <div>${favIdx3Int != null ? favIdx3Int + '%' : '—'}</div>
      </div>
    </div>
  `;
}

// --- Favorite vs Outsider compact compare block ---
function renderFavOppCompare(payload) {
  const safePct = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + '%' : '—');
  const safeIntPct = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) + '%' : '—');
  const nbLine = (x, y) => [
    (typeof x === 'number' && isFinite(x)) ? `без H2H ${Math.round(x)}%` : null,
    (typeof y === 'number' && isFinite(y)) ? `с H2H ${Math.round(y)}%` : null
  ].filter(Boolean).join(' • ');
  const formatDots = (tokensStr) => {
    if (!tokensStr) return '';
    const tokens = String(tokensStr).trim().split(/\s+/).filter(Boolean);
    const mk = (cls, color) => `<span class="dot ${cls}" title="${cls==='dot-win'?'win':'loss'}" style="width:8px;height:8px;border-radius:50%;display:inline-block;box-shadow:0 0 0 1px rgba(0,0,0,0.12) inset;margin-right:3px;vertical-align:middle;background:${color};"></span>`;
    return tokens.map(t => (t === '🟢' ? mk('dot-win', '#22c55e') : mk('dot-loss', '#ef4444'))).join('');
  };

  const favName = payload?.favName || '';
  const oppName = payload?.oppName || '';
  // Use emojis in headers: 🏆 favorite, 🚫 outsider
  const favHdr = `🏆 ${favName || 'Фаворит'}`;
  const oppHdr = `🚫 ${oppName || 'Аутсайдер'}`;

  const favNb = nbLine(payload?.nbFavNo, payload?.nbFavWith);
  const oppNb = nbLine(payload?.nbOppNo, payload?.nbOppWith);
  // Show ML(3) as whole percentages (no decimals)
  const favMl = safeIntPct(payload?.mlFav3);
  const oppMl = safeIntPct(payload?.mlOpp3);
  const favIdx = safeIntPct(payload?.idxFav3);
  const oppIdx = safeIntPct(payload?.idxOpp3);
  const formatDelta = (d) => {
    if (typeof d !== 'number' || !isFinite(d)) return '';
    const sign = d > 0 ? '+' : (d < 0 ? '−' : '±');
    const arrow = d > 0 ? '↑' : (d < 0 ? '↓' : '→');
    const color = d > 0 ? '#22c55e' : (d < 0 ? '#ef4444' : '#64748b');
    const val = Math.abs(Math.round(d));
    return `<span class="nb-win" style="color:${color}">${sign}${val}% ${arrow}</span>`;
  };
  const d35Fav = (typeof payload?.d3_5Fav === 'number') ? payload.d3_5Fav : null;
  const d35Opp = (typeof payload?.d3_5Opp === 'number') ? payload.d3_5Opp : null;
  const last10Avail = !!payload?.last10Avail;
  const last10Tokens = payload?.last10Tokens;
  const last10Html = last10Avail
    ? (last10Tokens ? `${formatDots(last10Tokens)}` : '')
    : '<span style="color:#64748b;">нет H2H</span>';
  // Visualization rows (per-player recent results)
  const visFavTokens = payload?.visFavTokens || '';
  const visOppTokens = payload?.visOppTokens || '';
  const visFavHtml = visFavTokens ? formatDots(visFavTokens) : '';
  const visOppHtml = visOppTokens ? formatDots(visOppTokens) : '';

  // --- Markov–Bradley–Terry (independent method) ---
  const mbt = (() => {
    try {
      // Формируем вероятность только по форме (последние 5 игр каждого)
      const toArr = (s)=> String(s||'').trim().split(/\s+/).filter(Boolean).map(t=>t==='🟢'?1:(t==='🔴'?0:null)).filter(v=>v!=null);
      const arrFav = toArr(visFavTokens).slice(0,5);
      const arrOpp = toArr(visOppTokens).slice(0,5);
      const p_f1 = arrFav.length ? (arrFav.reduce((a,b)=>a+b,0)/arrFav.length) : null;
      const p_f2 = arrOpp.length ? (arrOpp.reduce((a,b)=>a+b,0)/arrOpp.length) : null;
      const p_form_rel = (p_f1!=null && p_f2!=null && (p_f1+p_f2)>0) ? (p_f1/(p_f1+p_f2)) : null;
      let p = p_form_rel;
      if(p==null) return null;
      p = Math.max(0.01, Math.min(0.99, p));
      const q = 1-p;
      const p30 = p**3;
      const p31 = 3*p**3*q;
      const p32 = 6*p**3*q**2;
      const p03 = q**3;
      const p13 = 3*q**3*p;
      const p23 = 6*q**3*p**2;
      const PA = p30+p31+p32; const PB = p03+p13+p23;
      const norm = (PA+PB)>0 ? (PA/(PA+PB)) : p;
      const map = { '3:0':p30,'3:1':p31,'3:2':p32,'0:3':p03,'1:3':p13,'2:3':p23 };
      const best = Object.entries(map).sort((a,b)=>b[1]-a[1])[0][0];
      const p45 = p31+p13+p32+p23;
      return { pFav:norm, pOpp:1-norm, bestScore:best, p45 };
    } catch(_) { return null; }
  })();

  // Compute simple FCI text if provided in payload
  const fciRow = (typeof payload?.fciFavPct === 'number') ? `
      <div class="cmp-row fci" style="display:grid;grid-template-columns:1fr;gap:0;border-bottom:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;font-weight:700;">${payload?.favName || 'Фаворит'} — FCI: ${Math.round(payload.fciFavPct)}%</div>
      </div>` : '';
  // Committee info line: "Fav: <name> • Комитет (калибр.): <pct>%"
  const committeeInfo = (typeof payload?.committeePct === 'number') ? `
      <div class="cmp-row committee" style="display:grid;grid-template-columns:1fr;gap:0;border-bottom:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;">Fav: ${payload?.favName || 'Фаворит'} • Комитет (калибр.): ${Math.round(payload.committeePct)}%</div>
      </div>` : '';

  return `
    <div class="min2-compare" style="margin-top:8px;background:#fff;color:#222;border:1px solid #e6e6e6;border-radius:10px;overflow:hidden;font:500 13px/1.4 system-ui;">
      <div class="cmp-head" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #eee;background:#f7f7f7;">
        <div style="padding:8px 10px;font-weight:600;">${favHdr}</div>
        <div style="padding:8px 10px;font-weight:600;border-left:1px solid #eee;">${oppHdr}</div>
      </div>
      <div class="cmp-row nb3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #f1f1f1;">
        <div class="fav nb3" style="padding:8px 10px;">${favNb}</div>
        <div class="opp nb3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${oppNb}</div>
      </div>
      <div class="cmp-row ml3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #f1f1f1;">
        <div class="fav ml3" style="padding:8px 10px;">${favMl}</div>
        <div class="opp ml3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${oppMl}</div>
      </div>
      <div class="cmp-row idx3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <div class="fav idx3" style="padding:8px 10px;">${favIdx}</div>
        <div class="opp idx3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${oppIdx}</div>
      </div>
      <div class="cmp-row d35" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #f1f1f1;">
        <div class="fav d35" style="padding:8px 10px;">${formatDelta(d35Fav)}</div>
        <div class="opp d35" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${formatDelta(d35Opp)}</div>
      </div>
      ${`
      <div class="cmp-row viz" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #f1f1f1;">
        <div class="fav viz" style="padding:8px 10px;">${visFavHtml}</div>
        <div class="opp viz" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${visOppHtml}</div>
      </div>`}
      ${`
      <div class="cmp-row last10" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #f1f1f1;">
        <div class="fav last10" style="padding:8px 10px; grid-column: 1 / span 2;">${last10Html}</div>
      </div>`}
      
      ${mbt ? `
      <div class="cmp-row mbt" style="display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;font-weight:600;color:#111827;">Марков–BT ${Math.round(mbt.pFav*100)}% и Топ-счёт: ${mbt.bestScore}</div>
      </div>` : ''}
      ${ (typeof payload?.fciFavPct === 'number') ? `
      <div class="cmp-row fci" style="display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;">FCI: ${Math.round(payload.fciFavPct)}%</div>
      </div>
      ${committeeInfo}` : committeeInfo}
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

  // --------- Live panel for /live_v2 ---------
  const runLivePanel = () => {
    try { if (!/\/live_v2\/?/i.test(location.pathname)) return; } catch { return; }
    const PANEL_ID = 'tsx-live-panel';
    const byUrl = new Map();
    const $row = (a) => a.closest('tr') || a.closest('[role="row"]') || a.closest('.row') || a.closest('li') || a.closest('.match') || a.parentElement;
    const parseScoreFromMob = (row) => {
      const td = row && row.querySelector('td.td-mob.mob-score, .td-mob.mob-score, .mob-score');
      const blocks = td ? Array.from(td.querySelectorAll('.score')).slice(0,2) : [];
      if (!blocks.length) return null;
      const readSum = (b)=>{ const d=b&&b.querySelector('.sum'); const t=d&&(d.textContent||'').trim(); const n=parseInt(t,10); return Number.isFinite(n)? n : null; };
      const sA = readSum(blocks[0]); const sB = readSum(blocks[1]);
      if (sA==null || sB==null) return null;
      const setsA = blocks[0]? Array.from(blocks[0].querySelectorAll('.set')).map(x=>(x.textContent||'').trim()):[];
      const setsB = blocks[1]? Array.from(blocks[1].querySelectorAll('.set')).map(x=>(x.textContent||'').trim()):[];
      const n = Math.min(setsA.length, setsB.length);
      const pairs = []; for(let i=0;i<n;i++){ pairs.push(`${setsA[i]}:${setsB[i]}`); }
      while (pairs.length && /^0\s*:\s*0$/.test(pairs[pairs.length-1])) pairs.pop();
      const finished = (sA===3 || sB===3);
      return { score: `${sA}:${sB}`, pairs, finished };
    };
    const parseNamesFromHref = (a) => {
      try {
        const u = new URL(a.getAttribute('href') || a.href, location.origin);
        const lp = u.searchParams.get('lp');
        const rp = u.searchParams.get('rp');
        return { left: lp||'', right: rp||'' };
      } catch { return { left:'', right:'' }; }
    };
    const collect = () => {
      const anchors = Array.from(document.querySelectorAll("a[href*='/stats/?']"));
      for (const a of anchors) {
        const row = $row(a);
        const url = (a.getAttribute('href') || a.href) ? new URL(a.getAttribute('href') || a.href, location.origin).href : null;
        if (!url) continue;
        const nm = parseNamesFromHref(a);
        const sc = parseScoreFromMob(row);
        const val = byUrl.get(url) || { url, names: nm, score: null, sets: [], finished: false, row };
        if (sc) { val.score = sc.score; val.sets = sc.pairs; val.finished = sc.finished; }
        val.row = row; val.names = nm;
        byUrl.set(url, val);
      }
      return Array.from(byUrl.values());
    };
    const ensurePanel = () => {
      let box = document.getElementById(PANEL_ID);
      if (!box) { box = document.createElement('div'); box.id = PANEL_ID; document.body.appendChild(box); }
      return box;
    };
    const render = () => {
      const list = collect();
      const box = ensurePanel();
      const lines = [];
      for (const it of list) {
        const names = `${it.names.left || '?'} vs ${it.names.right || '?'}`;
        const score = it.score ? it.score : '—:—';
        const sets = it.sets && it.sets.length? ` (${it.sets.join(', ')})` : '';
        lines.push(`<div class=\"row\" data-url=\"${(it.url||"" ).replace(/"/g, "&quot;")}\" data-score=\"${score}\" data-finished=\"${it.finished?"1":"0"}\" data-sets=\"${(it.sets||[]).join("|")}\" ><div class=\"names\">${names}</div><div class=\"score\">${score}</div><div class=\"sets\">${sets}</div></div>`);
        try {
          if (it.row && it.score) {
            const a = it.row.querySelector("a[href*='/stats/?']");
            if (a) {
              let b = a.parentElement && a.parentElement.querySelector('.tsx-inline-score');
              if (!b) { b = document.createElement('span'); b.className = 'tsx-inline-score'; a.parentElement && a.parentElement.appendChild(b); }
              b.textContent = it.score;
            }
          }
        } catch(_){}
      }
      box.innerHTML = lines.length ? lines.join('') : '<div class="row"><div class="names">Нет активных матчей</div></div>';
    };
    render();
    const mo = new MutationObserver(() => { requestAnimationFrame(render); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // Drop frequent polling; rely on mutations, with rare safety tick
    try { setInterval(render, (window.__TSX_SERVER_MODE__? 15000 : 8000)); } catch(_) {}
  };

  const install = () => {
    ensureButton();
    try { runLivePanel(); } catch {}
    // If a previous version injected summaries, remove them to restore original page
    try {
      const ex = document.getElementById('tsx-auto-summaries');
      if (ex) ex.remove();
    } catch {}
    // Expose parser for console usage
    try {
      window.__tennisScoreExtract = parseAll;
      window.__renderMinTwoSets = renderMinTwoSets;
      // Expose manual insertion of summary blocks (disabled by default)
      window.__insertAutoBlocks = insertAutoBlocks;
      window.__insertMinTwoBeforeName = insertMinTwoBeforeName;
      window.__updateMin2Blocks = updateAllMin2Extracts;
    } catch {}
    // Auto-insert compact decision block on match pages, centered at top of container
    try { autoInsertDecisionOnMatchPage(); } catch {}
    // Keep targeted insertion for specific stats page demo (no-op if not applicable)
    try { autoInsertForTSProStats(); } catch {}
    try { ensureFCIInline(); } catch {}
    // After insertion, update any existing min2 blocks on the page (ids may vary)
    try { updateAllMin2Extracts(); } catch {}
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
    const addedPlayerName = mut.some((m) =>
      Array.from(m.addedNodes || []).some((n) => n.nodeType === 1 && (n.matches?.('.gamer-name.pr-2') || n.querySelector?.('.gamer-name.pr-2')))
    );
    if (addedPlayerName) {
      try { autoInsertForTSProStats(); } catch {}
      try { updateAllMin2Extracts(); } catch {}
    }
    const containerAppeared = mut.some((m) =>
      Array.from(m.addedNodes || []).some((n) => n.nodeType === 1 && (n.matches?.('.container-xl.mb-5') || n.querySelector?.('.container-xl.mb-5')))
    );
    if (containerAppeared) {
      try { autoInsertDecisionOnMatchPage(); } catch {}
      try { updateAllMin2Extracts(); } catch {}
      try { ensureFCIInline(); } catch {}
    }
    // If the favImproved block appears later, inject FCI above it
    const favBlockAppeared = mut.some((m) =>
      Array.from(m.addedNodes || []).some((n) => n.nodeType === 1 && (n.matches?.('#favImproved') || n.querySelector?.('#favImproved')))
    );
    if (favBlockAppeared) {
      try { ensureFCIInline(); } catch {}
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Update existing on-page take-two-sets/min2-extract blocks to reflect recalculated values
  function updateAllMin2Extracts() {
    try {
      let data = null;
      try { data = buildAnalyzeData({}); } catch (_) { return; }
      if (!data || !data.playerA || !data.playerB) return;
      const a10 = Number(data.playerA.nonBTProbability10 ?? data.playerA.nonBTProbability);
      const b10 = Number(data.playerB.nonBTProbability10 ?? data.playerB.nonBTProbability);
      if (!Number.isFinite(a10) || !Number.isFinite(b10)) return;
      const a3 = Number(data.playerA.nonBTProbability3);
      const b3 = Number(data.playerB.nonBTProbability3);
      const favIsA = a10 >= b10;
      const favName = favIsA ? (data.playerA.name || 'Игрок 1') : (data.playerB.name || 'Игрок 2');

      // Compute logistic(3) with the same model as popup
      const p3 = computeModelP3(data);
      const favMl3 = favIsA ? (p3.pA*100) : (p3.pB*100);
      const favMl3Str = (typeof favMl3 === 'number' && isFinite(favMl3)) ? (Math.round(favMl3*10)/10).toFixed(1) + '%' : '—';
      const favMl3Int = (typeof favMl3 === 'number' && isFinite(favMl3)) ? Math.round(favMl3) : null;
      const favIdx3 = favIsA ? a3 : b3;
      const favIdx3Int = Number.isFinite(favIdx3) ? Math.round(favIdx3) : null;

      // Recompute verdict/matched for header
      const gapNB3 = (favIsA ? a3 - b3 : b3 - a3);
      const passNoBt3 = Number.isFinite(gapNB3) && gapNB3 >= 15;
      const passForm3 = passNoBt3; // proxy approximation
      const passMl3 = (typeof favMl3 === 'number' && isFinite(favMl3)) ? (favMl3 > 53) : false;
      const matched = (passNoBt3?1:0)+(passForm3?1:0)+(passMl3?1:0);
      let verdict = 'Осторожно'; let color = '#aa0';
      const favP3 = favIsA ? a3 : b3; const passIdx = Number.isFinite(favP3) && favP3 > 55;
      if (!passMl3 || !passIdx || matched <= 1) { verdict='PASS'; color='#a00'; }
      else if (matched >= 2) { verdict='GO'; color='#0a0'; }

      // Compute NB(3) without/with H2H for favorite
      const a3h = Number(data?.playerA?.nonBTProbability3_h2h);
      const b3h = Number(data?.playerB?.nonBTProbability3_h2h);
      const nbNo = favIsA ? a3 : b3;
      const nbWith = favIsA ? a3h : b3h;
      const nbLine = [
        Number.isFinite(nbNo) ? `без H2H ${Math.round(nbNo)}%` : null,
        Number.isFinite(nbWith) ? `с H2H ${Math.round(nbWith)}%` : null
      ].filter(Boolean).join(' • ');

      // Update all blocks
      document.querySelectorAll('.take-two-sets .min2-extract').forEach((el) => {
        try {
          const holder = el.closest('.take-two-sets');
          if (holder) holder.style.background = color;
          // Header: first child div of holder
          const header = holder ? holder.querySelector(':scope > div') : null;
          if (header) header.textContent = `🔎 Решение: ${verdict} | Совпадений: ${matched}/3 • Фаворит: ${favName}`;
          // Data attributes
          el.setAttribute('data-fav', favName);
          if (favMl3Int != null) el.setAttribute('data-log3', String(favMl3Int)); else el.removeAttribute('data-log3');
          if (favIdx3Int != null) el.setAttribute('data-idx3', String(favIdx3Int)); else el.removeAttribute('data-idx3');
          if (Number.isFinite(nbNo)) el.setAttribute('data-nb3-no', String(Math.round(nbNo))); else el.removeAttribute('data-nb3-no');
          if (Number.isFinite(nbWith)) el.setAttribute('data-nb3-with', String(Math.round(nbWith))); else el.removeAttribute('data-nb3-with');
          // Text nodes
          const nameDiv = el.children[0]; if (nameDiv) nameDiv.textContent = `Фаворит ${favName}`;
          // Ensure NB3 line exists right after name
          let nbDiv = el.querySelector('.min2-nb3');
          if (!nbDiv) {
            nbDiv = document.createElement('div');
            nbDiv.className = 'min2-nb3';
            if (el.children.length >= 2) el.insertBefore(nbDiv, el.children[1]); else el.appendChild(nbDiv);
          }
          nbDiv.textContent = nbLine || '';
          const logDiv = el.querySelector('.min2-log3') || el.children[2]; if (logDiv) logDiv.textContent = favMl3Str;
          const idxDiv = el.children[3] || el.children[2]; if (idxDiv) idxDiv.textContent = (favIdx3Int != null ? (favIdx3Int+'%') : '—');
        } catch(_){}
      });
    } catch(_) { /* noop */ }
  }

  // Compute logistic(3) like popup's model forecast table to keep values consistent
  function computeModelP3(d) {
    try {
      const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
      const recA10 = Array.isArray(d?.recentsA10)? d.recentsA10 : [];
      const recB10 = Array.isArray(d?.recentsB10)? d.recentsB10 : [];
      const setsAvgDiffPerSet = (rec)=>{ let diff=0, sets=0; (rec||[]).forEach(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; s.forEach(([a,b])=>{ const aa=+a||0, bb=+b||0; diff += (aa-bb); sets++; }); }); return sets? (diff/sets) : 0; };
      const perMatchSetDiff = (rec)=> (rec||[]).map(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; let diff=0; s.forEach(([a,b])=>{ diff += ((+a||0) - (+b||0)); }); return s.length? (diff/s.length) : 0; });
      const emaArr = (arr,a)=>{ if(!arr.length) return 0; let s=arr[0]; for(let i=1;i<arr.length;i++) s=a*arr[i]+(1-a)*s; return s; };
      const slope3 = (arr)=>{ const L=arr.slice(0,3); const n=L.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=L[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; } const den=n*sxx-sx*sx; return den? (n*sxy - sx*sy)/den : 0; };
      const pointsSummaryDiff = (rec)=>{ let sum=0; (rec||[]).forEach(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; s.forEach(([a,b])=>{ sum += ((+a||0) - (+b||0)); }); }); return sum; };
      const SstarA = Number(d?.playerA?.S_star); const SstarB = Number(d?.playerB?.S_star);
      const EXT_A = Number(d?.playerA?.patterns?  ( (1-(d.playerA.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerA.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerA.patterns.tiebreak_losses?.rate||0))*20 + (d.playerA.patterns.decisive_fifth_wins?.rate||d.playerA.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const EXT_B = Number(d?.playerB?.patterns?  ( (1-(d.playerB.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerB.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerB.patterns.tiebreak_losses?.rate||0))*20 + (d.playerB.patterns.decisive_fifth_wins?.rate||d.playerB.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const STAB_A = Number(d?.playerA?.stability||0)*100; const STAB_B = Number(d?.playerB?.stability||0)*100;
      const A = recA10.slice(0,3), B = recB10.slice(0,3);
      const A_per = perMatchSetDiff(A), B_per = perMatchSetDiff(B);
      const F_short_A = emaArr(A_per.slice(0,5), 0.7);
      const F_short_B = emaArr(B_per.slice(0,5), 0.7);
      const Trend_A = slope3(A_per); const Trend_B = slope3(B_per);
      const NF = 6;
      let dF = ((F_short_A - F_short_B) + 0.5*(Trend_A - Trend_B)) / NF; dF = clamp(dF, -1, 1);
      const NS = 0.5; let dS = (isFinite(SstarA)&&isFinite(SstarB))? ((SstarA - SstarB)/NS) : 0; dS = clamp(dS, -1, 1);
      const A10 = setsAvgDiffPerSet(recA10), B10 = setsAvgDiffPerSet(recB10);
      const A5  = setsAvgDiffPerSet(recA10.slice(0,5)),  B5  = setsAvgDiffPerSet(recB10.slice(0,5));
      let baseD = 0.6*((A5-B5)) + 0.4*((A10-B10));
      const favA3  = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0);
      const PDk_A  = pointsSummaryDiff(A);
      let blow = 0; if (favA3){ if ((PDk_A||0)>=25) blow += 0.12; }
      const hFav = favA3? (d?.h2hOrientedA||[]) : (d?.h2hOrientedB||[]);
      const lostK = (k)=>{ let c=0; for(let i=0;i<Math.min(k,hFav.length);i++){ const fo=hFav[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) c++; } return c===k; };
      if (lostK(2)) blow += 0.20; if (lostK(3)) blow += 0.35;
      let dD = baseD - blow; const ND = 4; dD = clamp(dD/ND, -1, 1);
      const pairRates = (()=>{ let tb=0,sets=0,long=0,m=0; [A,B].forEach(arr=>{ arr.forEach(mm=>{ const s=Array.isArray(mm.setsOwnOpponent)? mm.setsOwnOpponent:[]; if(s.length){ m++; if(s.length>=4) long++; } s.forEach(([a,b])=>{ const aa=+a||0,bb=+b||0; if(aa>=10&&bb>=10) tb++; sets++; }); }); }); return { tb: (sets? tb/sets:0), long:(m? long/m:0) }; })();
      let ExtGap = (EXT_A - EXT_B)/100, StabTerm = (STAB_A - STAB_B)/100;
      let dT_raw = 0.6*ExtGap + 0.2*StabTerm + 0.2*(pairRates.tb - 0.5) + 0.2*(pairRates.long - 0.5);
      if (EXT_B - EXT_A >= 12 && favA3) dT_raw -= 0.25;
      const NT = 0.7; let dT = clamp(dT_raw/NT, -1, 1);
      const bF=0.35, bS=0.30, bD=0.25, bT=0.15, b0=0.0;
      const z = b0 + bF*dF + bS*dS + bD*dD + bT*dT;
      let pFav = 1/(1+Math.exp(-z));
      const Pnb = ((Number(d?.playerA?.nonBTProbability3)||0)/100);
      if (Pnb>=0.47 && Pnb<=0.53 && (EXT_A>=80 && EXT_B>=80)) pFav = 1/(1+Math.exp(-(z-0.35)));
      if (favA3 && (PDk_A||0) >= 25) pFav = Math.min(pFav, 0.77);
      if (lostK(2)) pFav = 1/(1+Math.exp(-(z-0.30)));
      if (lostK(3)) pFav = 1/(1+Math.exp(-(z-0.50)));
      const pA = favA3? pFav : (1-pFav);
      return { pA, pB: 1-pA };
    } catch(_) {
      return { pA: NaN, pB: NaN };
    }
  }

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
    // Build per-player non-BT windows for reorientation flexibility
    const A = {
      p10: a10, p5: a5, p3: a3,
      d5_10: (Number.isFinite(a5) && Number.isFinite(a10)) ? (a5 - a10) : undefined,
      d3_5:  (Number.isFinite(a3) && Number.isFinite(a5))  ? (a3 - a5)  : undefined,
      name: nameA
    };
    const B = {
      p10: b10, p5: b5, p3: b3,
      d5_10: (Number.isFinite(b5) && Number.isFinite(b10)) ? (b5 - b10) : undefined,
      d3_5:  (Number.isFinite(b3) && Number.isFinite(b5))  ? (b3 - b5)  : undefined,
      name: nameB
    };
    // Orientation by 10-game non-BT (for Decision Summary)
    const fav10 = favIsA ? { ...A } : { ...B };
    const opp10 = favIsA ? { ...B } : { ...A };
    const form10 = { p3Fav: fav10.p3, p3Opp: opp10.p3 };
    // Align logistic probabilities with the selected favorite.
    // Prefer calibrated forecast (if available), fallback to predWinProbA/B.
    const pA_fore = (typeof data?.forecast?.pA === 'number') ? Math.round(data.forecast.pA * 100) : undefined;
    const pB_fore = (typeof data?.forecast?.pB === 'number') ? Math.round(data.forecast.pB * 100) : undefined;
    const pA = Number.isFinite(pA_fore) ? pA_fore : (Number.isFinite(data.predWinProbA) ? data.predWinProbA : undefined);
    const pB = Number.isFinite(pB_fore) ? pB_fore : (Number.isFinite(data.predWinProbB) ? data.predWinProbB : undefined);
    // Compute logistic probability specifically on N=3 window to match UI table
    const recA = Array.isArray(data.recentsA10) ? data.recentsA10 : [];
    const recB = Array.isArray(data.recentsB10) ? data.recentsB10 : [];
    const h2hA = Array.isArray(data.h2hOrientedA) ? data.h2hOrientedA : [];
    const h2hB = Array.isArray(data.h2hOrientedB) ? data.h2hOrientedB : [];
    const computeWeightedFeaturesN = (arr, N=10, alpha=0.85) => {
      const L = (arr || []).slice(0, N);
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
        for (const [a0, b0] of sets) {
          const a = Number(a0) || 0, b = Number(b0) || 0;
          ptsDiffW += w * (a - b);
          ptsTotCountW += w * 1;
          if (Math.abs(a - b) <= 2) tightCntW += w * 1;
        }
        setsTotW += w * (em.ownSets + em.oppSets);
      }
      const F = (winsW + lossesW) > 0 ? (winsW - lossesW) / (winsW + lossesW) : 0;
      const S = setsTotW > 0 ? (setsWinW - setsLossW) / setsTotW : 0;
      const D = ptsTotCountW > 0 ? (ptsDiffW / ptsTotCountW) / 11 : 0;
      const T = ptsTotCountW > 0 ? (tightCntW / ptsTotCountW) : 0;
      const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
      return { F: clamp(F, -1, 1), S: clamp(S, -1, 1), D: clamp(D, -1, 1), T: clamp(T, -1, 1), setsTotal: setsTotW };
    };
    const windowLogistic = (recA, recB, h2hA, h2hB, N=3) => {
      try {
        const featA = computeWeightedFeaturesN(recA, N);
        const featB = computeWeightedFeaturesN(recB, N);
        const h2hFeatA = computeWeightedFeaturesN(h2hA, Math.min(N, 10));
        const h2hFeatB = computeWeightedFeaturesN(h2hB, Math.min(N, 10));
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
        const setsVol = Math.max(0, Math.min(1, (featA.setsTotal + featB.setsTotal) / 40));
        const h2hVol = Math.max(0, Math.min(1, ((h2hFeatA.setsTotal||0) + (h2hFeatB.setsTotal||0)) / 20));
        const tau = 2.0 - 0.6*setsVol - 0.3*h2hVol;
        const shrink = 0.65 + 0.15*(setsVol + 0.5*h2hVol);
        const clipLo = 0.22 - 0.04*(setsVol + 0.5*h2hVol);
        const clipHi = 1 - clipLo;
        const pTemp = 1/(1+Math.exp(-(z/Math.max(1e-6,tau))));
        let pCal = 0.5 + shrink*(pTemp - 0.5);
        pCal = Math.max(clipLo, Math.min(clipHi, pCal));
        const pA01 = pCal; const pB01 = 1 - pA01;
        return [Math.round(pA01*100), Math.round(pB01*100)];
      } catch(_) { return [undefined, undefined]; }
    };
    // Prefer values computed in buildAnalyzeData for exact N=3 window
    let pA3_win = (typeof data?.logistic?.pA3 === 'number') ? data.logistic.pA3 : undefined;
    let pB3_win = (typeof data?.logistic?.pB3 === 'number') ? data.logistic.pB3 : undefined;
    if (!Number.isFinite(pA3_win) || !Number.isFinite(pB3_win)) {
      // Fallback to local computation
      const pair = windowLogistic(recA, recB, h2hA, h2hB, 3);
      pA3_win = pair[0]; pB3_win = pair[1];
    }
    if (!Number.isFinite(pA3_win) || !Number.isFinite(pB3_win)) {
      // Final fallback to general forecast or pred
      pA3_win = pA; pB3_win = pB;
    }
    // Build logistic(3)-oriented mapping for the 3-window block
    const fav3IsA = Number(pA3_win) >= Number(pB3_win);
    const fav3 = fav3IsA ? { ...A } : { ...B };
    const opp3 = fav3IsA ? { ...B } : { ...A };
    const form3 = { p3Fav: fav3.p3, p3Opp: opp3.p3 };
    const ml10 = favIsA
      ? { pFav3: pA3_win, pOpp3: pB3_win }
      : { pFav3: pB3_win, pOpp3: pA3_win };
    const ml3 = fav3IsA
      ? { pFav3: pA3_win, pOpp3: pB3_win }
      : { pFav3: pB3_win, pOpp3: pA3_win };

    // Separate matches for the two summaries
    // Top block (3-window) should be anchored to the main (non-BT 10) favorite
    const matchTop = { fav: fav10, opp: opp10, form: form10, ml: ml10, baseProb: fav10.p10, confidence: undefined, favName: fav10.name, oppName: opp10.name };
    const match10 = { fav: fav10, opp: opp10, form: form10, ml: ml10, baseProb: fav10.p10, confidence: undefined, favName: fav10.name, oppName: opp10.name };

    const htmlTop = renderMinTwoSets(matchTop);
    // Favorite series for context (prefer H2H up to 10; fallback to recents)
    const favSeries_t = ((favIsA ? h2hA : h2hB) || []).slice(0,10);
    const baseTokens_t = (favSeries_t.length ? favSeries_t : (favIsA ? recA : recB).slice(0,10));
    const tokens_t = baseTokens_t.map(m => { const own=Number(m?.finalScoreOwnOpponent?.own)||0; const opp=Number(m?.finalScoreOwnOpponent?.opponent)||0; return own>opp?'🟢':'🔴'; });
    const wins_t = tokens_t.filter(t => t==='🟢').length; const losses_t = tokens_t.length - wins_t;
    // H2H visualization string relative to playerA; invert if favorite is B
    const baseVis_ins = (data?.h2h && typeof data.h2h.visualization==='string') ? data.h2h.visualization : '';
    const tokens_ins = (favIsA ? baseVis_ins : baseVis_ins.replace(/🟢|🔴/g, m => (m==='🟢'?'🔴':'🟢'))).trim();
    const cmpPayload_ins = {
      favName: fav10.name,
      oppName: opp10.name,
      nbFavNo: nbNo_ins,
      nbFavWith: nbWith_ins,
      nbOppNo: favIsA ? b3 : a3,
      nbOppWith: favIsA ? b3h_ins : a3h_ins,
      mlFav3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pA3_win : pB3_win) : undefined,
      mlOpp3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pB3_win : pA3_win) : undefined,
      idxFav3: fav10.p3,
      idxOpp3: opp10.p3,
      d3_5Fav: (typeof fav10?.d3_5 === 'number') ? fav10.d3_5 : null,
      d3_5Opp: (typeof opp10?.d3_5 === 'number') ? opp10.d3_5 : null,
      last10Avail: Number(data?.h2h?.total) > 0,
      last10Tokens: tokens_ins || null,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' ')
    };
    // htmlCmp_ins будет создан ниже, после расчёта FCI и committee
    // Build compare block (fav vs outsider) right under the decision block
    const a3h_dec = Number(data?.playerA?.nonBTProbability3_h2h);
    const b3h_dec = Number(data?.playerB?.nonBTProbability3_h2h);
    const baseVis_dec = (data?.h2h && typeof data.h2h.visualization==='string') ? data.h2h.visualization : '';
    const tokens_dec = (favIsA ? baseVis_dec : baseVis_dec.replace(/🟢|🔴/g, m => (m==='🟢'?'🔴':'🟢'))).trim();
    // Hybrid Markov by points from recent matches, oriented to favorite
    const hmRes = computeHybridMarkov(favIsA ? recA10 : recB10, favIsA ? recB10 : recA10, 7) || null;

    const cmpPayload_dec = {
      favName: fav10.name,
      oppName: opp10.name,
      nbFavNo: favIsA ? a3 : b3,
      nbFavWith: favIsA ? a3h_dec : b3h_dec,
      nbOppNo: favIsA ? b3 : a3,
      nbOppWith: favIsA ? b3h_dec : a3h_dec,
      mlFav3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pA3_win : pB3_win) : undefined,
      mlOpp3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pB3_win : pA3_win) : undefined,
      idxFav3: fav10.p3,
      idxOpp3: opp10.p3,
      d3_5Fav: (typeof fav10?.d3_5 === 'number') ? fav10.d3_5 : null,
      d3_5Opp: (typeof opp10?.d3_5 === 'number') ? opp10.d3_5 : null,
      last10Avail: Number(data?.h2h?.total) > 0,
      last10Tokens: tokens_dec || null,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      // H2H wins summary for Markov–BT block (oriented relative to favorite)
      h2hWinsFav: favIsA ? (Number(data?.h2h?.summary?.A?.wins)||0) : (Number(data?.h2h?.summary?.B?.wins)||0),
      h2hWinsOpp: favIsA ? (Number(data?.h2h?.summary?.B?.wins)||0) : (Number(data?.h2h?.summary?.A?.wins)||0),
      h2hTotal: Number(data?.h2h?.summary?.A?.total||0)
    };
    // Compute FCI for favorite and pass into compare payload for inline rendering (inline block)
    let FCI_ins = computeFCI(data, {
      favIsA,
      base3: favIsA ? a3 : b3,
      idxFav3: fav10.p3,
      mlFav3: (function(){ const v = favIsA ? pA3_win : pB3_win; return Number.isFinite(v)? v : undefined; })(),
      d5_10: fav10.d5_10,
      d3_5: fav10.d3_5,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
    });
    if (!FCI_ins) {
      const pctTo01 = (x)=> (typeof x==='number'? Math.max(0,Math.min(1,x/100)) : null);
      const base3p = pctTo01(favIsA ? a3 : b3);
      const logit3p = (function(){ const v = favIsA ? pA3_win : pB3_win; return pctTo01(v); })();
      const proxy = (base3p!=null? base3p : (logit3p!=null? logit3p : 0.5));
      FCI_ins = { FCI: proxy, verdict: '', color: '#111827' };
    }
    // Committee probability (calibrated forecast/pred), oriented to favorite
    // Committee (calibrated) percent for favorite (0..1). Try several sources.
    let committeeFav = null;
    try {
      const pA_fore01 = (typeof data?.forecast?.pA === 'number') ? data.forecast.pA : (typeof data?.predWinProbA==='number'? data.predWinProbA/100 : null);
      const pB_fore01 = (typeof data?.forecast?.pB === 'number') ? data.forecast.pB : (typeof data?.predWinProbB==='number'? data.predWinProbB/100 : null);
      const v = favIsA ? pA_fore01 : (pB_fore01!=null? (1-pB_fore01) : null);
      if (typeof v === 'number' && isFinite(v)) committeeFav = v;
    } catch(_) {}
    // Fallback: parse from summary line if present (inserted by popup override)
    if (committeeFav == null) {
      try {
        const sv = document.getElementById('summaryFav');
        const txt = sv ? (sv.innerText || sv.textContent || '') : '';
        const m = String(txt).match(/Комитет\s*\(калибр\.\)\s*:\s*(\d{1,3})%/i);
        if (m) {
          const vv = Number(m[1])/100; if (isFinite(vv)) committeeFav = vv;
        }
      } catch(_) {}
    }

    // Read FCI from minimalForecastBlock if present (UI-rendered value)
    let fciFromUI = null;
    try {
      const mf = document.getElementById('mfTitle');
      const txt = mf ? (mf.innerText || mf.textContent || '') : '';
      const mm = String(txt).match(/FCI\s*:\s*(\d{1,3})%/i);
      if (mm) { const vv = Number(mm[1]); if (isFinite(vv)) fciFromUI = vv; }
    } catch(_) {}

    const cmpPayload_dec2 = {
      ...cmpPayload_dec,
      fciFavPct: (fciFromUI!=null ? fciFromUI : Math.round((FCI_ins.FCI||0)*100)),
      committeePct: (committeeFav!=null ? Math.round(committeeFav*100) : undefined),
      hmProb: hmRes ? Math.round((hmRes.p_match||0)*100) : undefined,
      hmTop: hmRes ? (hmRes.topScore||undefined) : undefined,
      hmP2sets: hmRes ? Math.round((hmRes.p_2sets||0)*100) : undefined
    };
    // Добавим FCI/committee и в первый compare-блок (ins)
    try {
      if (FCI_ins && typeof FCI_ins.FCI==='number') cmpPayload_ins.fciFavPct = Math.round(FCI_ins.FCI*100);
      if (committeeFav!=null && isFinite(committeeFav)) cmpPayload_ins.committeePct = Math.round(committeeFav*100);
    } catch(_) {}
    const htmlCmp_ins = renderFavOppCompare(cmpPayload_ins);
    const htmlCmp = renderFavOppCompare(cmpPayload_dec2);

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
    // Compute FCI (improved): consensus-focused, low correlation with Committee
    function computeFCI_improved(data, ctx){
      try{
        const to01 = (x)=> (typeof x==='number' && isFinite(x)? Math.max(0,Math.min(1,x)) : null);
        const pct01 = (x)=> (typeof x==='number' && isFinite(x)? Math.max(0,Math.min(1,x/100)) : null);
        const favIsA = !!ctx.favIsA;
        // Helper: collect model probs for window w
        function modelsFor(w){
          const arr = [];
          // non-BT probabilities per window
          try{
            const pA = pct01(w===3? data?.playerA?.nonBTProbability3 : (w===5? data?.playerA?.nonBTProbability5 : (data?.playerA?.nonBTProbability10 ?? data?.playerA?.nonBTProbability)));
            const pB = pct01(w===3? data?.playerB?.nonBTProbability3 : (w===5? data?.playerB?.nonBTProbability5 : (data?.playerB?.nonBTProbability10 ?? data?.playerB?.nonBTProbability)));
            const p = favIsA? pA : pB;
            if (p!=null) arr.push(p);
          }catch(_){ }
          // logistic window (only have N=3 reliably)
          if (w===3){
            const log3 = pct01(ctx.mlFav3);
            if (log3!=null) arr.push(log3);
            const idx3 = pct01(ctx.idxFav3);
            if (idx3!=null) arr.push(idx3);
          }
          return arr;
        }
        function fciWindow(list){
          const xs = list.filter(v=>v!=null && isFinite(v));
          if (!xs.length) return null;
          const mean = xs.reduce((a,b)=>a+b,0)/xs.length;
          const std  = Math.sqrt(xs.reduce((s,x)=> s + (x-mean)*(x-mean), 0)/xs.length);
          const sign = mean - 0.5;
          const agree = 1 - Math.min(std/0.25, 1);
          return Math.max(0, Math.min(1, agree * (0.5 + 2*Math.abs(sign))));
        }
        const f3 = fciWindow(modelsFor(3));
        const f5 = fciWindow(modelsFor(5));
        const f10 = fciWindow(modelsFor(10));
        let FCI = 0;
        if (f3!=null) FCI += 0.6 * f3;
        if (f5!=null) FCI += 0.3 * f5;
        if (f10!=null) FCI += 0.1 * f10;
        // Stability context
        const sA = to01(data?.playerA?.stability);
        const sB = to01(data?.playerB?.stability);
        if (sA!=null && sB!=null){
          const A = sA, B = sB;
          if (A>0.85 && B>0.85 && Math.abs(A-B) < 0.10) FCI += 0.05;
          else if (Math.min(A,B) < 0.70) FCI -= 0.05;
        }
        FCI = Math.max(0, Math.min(1, FCI));
        let verdict='Равные шансы', color='#9ca3af';
        if (FCI >= 0.80){ verdict='Уверенный фаворит'; color='#16a34a'; }
        else if (FCI >= 0.65){ verdict='Фаворит с риском'; color='#f59e0b'; }
        else if (FCI >= 0.55){ verdict='50/50'; color='#9ca3af'; }
        else if (FCI >= 0.40){ verdict='Аутсайдер, но борется'; color='#f97316'; }
        else { verdict='Слабый игрок'; color='#ef4444'; }
        return { FCI, verdict, color };
      }catch(_){ return null; }
    }
    // Backward-compatible name used below
    function computeFCI(data, ctx){ return computeFCI_improved(data, ctx); }

    // Hybrid Markov based on point differences across recent matches
    function computeHybridMarkov(recFav, recOpp, k = 7) {
      try {
        const MS_DAY = 24*60*60*1000;
        const parseDM = (s) => {
          try {
            if (!s) return null;
            // Supports formats like "19.10 01:35" or "13.10"
            const m = String(s).match(/(\d{1,2})[.\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
            if (!m) return null;
            const dd = +m[1], mm = +m[2] - 1;
            const now = new Date();
            const yy = now.getFullYear();
            const HH = m[3] != null ? +m[3] : 12;
            const MM = m[4] != null ? +m[4] : 0;
            const dt = new Date(yy, mm, dd, HH, MM, 0);
            if (isNaN(dt.getTime())) return null;
            return dt;
          } catch(_) { return null; }
        };
        const countLast2Days = (arr) => {
          try {
            const now = new Date();
            const cutoff = now.getTime() - 2*MS_DAY;
            let c = 0;
            (arr||[]).forEach(m => {
              const d = parseDM(m?.date);
              if (d && d.getTime() >= cutoff) c++;
            });
            return c;
          } catch(_) { return 0; }
        };
        const pickWindow = (arr) => {
          const c2d = countLast2Days(arr);
          // Rule: <3 за 2 дня → берём 5 матчей; 5+ за 2 дня → 3 матча; иначе — 5
          const n = (c2d >= 5) ? 3 : 5;
          return (arr||[]).slice(0, n);
        };

        const diffs = (arr) => {
          const out = [];
          (arr||[]).forEach(m => {
            const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
            sets.forEach(([a,b]) => { const aa=Number(a)||0, bb=Number(b)||0; out.push(aa-bb); });
          });
          return out;
        };
        const pSet = (arr) => {
          const ds = diffs(arr);
          if (!ds.length) return 0.5;
          const ps = ds.map(d => 1/(1+Math.exp(-(d/k))));
          return ps.reduce((s,v)=>s+v,0)/ps.length;
        };
        const p1 = pSet(pickWindow(recFav));
        const p2 = pSet(pickWindow(recOpp));
        const p = (p1+p2)>0 ? (p1/(p1+p2)) : 0.5;
        const q = 1-p;
        const P30 = p**3;
        const P31 = 3*p**3*q;
        const P32 = 6*p**3*q**2;
        const P03 = q**3;
        const P13 = 3*q**3*p;
        const P23 = 6*q**3*p**2;
        const Pwin = P30+P31+P32;
        const Plose = P03+P13+P23;
        const P2 = Pwin + P23;
        const top = [['3:1',P31],['3:2',P32],['3:0',P30]].sort((a,b)=>b[1]-a[1])[0][0];
        return { p_match: (Pwin/(Pwin+Plose)), p_2sets: P2, topScore: top };
      } catch(_) { return null; }
    }
    const fciCtx = {
      favIsA,
      base3: favIsA ? a3 : b3,
      idxFav3: fav10.p3,
      mlFav3: (function(){ const v = favIsA ? pA3_win : pB3_win; return Number.isFinite(v)? v : undefined; })(),
      d5_10: fav10.d5_10,
      d3_5: fav10.d3_5,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
    };
    let FCI = computeFCI(data, fciCtx);
    if (!FCI) {
      // Fallback to a simple proxy if some sources unavailable
      const pctTo01 = (x)=> (typeof x==='number'? Math.max(0,Math.min(1,x/100)) : null);
      const base3p = pctTo01(favIsA ? a3 : b3);
      const logit3p = (function(){ const v = favIsA ? pA3_win : pB3_win; return pctTo01(v); })();
      const proxy = (base3p!=null? base3p : (logit3p!=null? logit3p : 0.5));
      const p = Math.max(0,Math.min(1, proxy));
      let verdict='Равные шансы', color='#9ca3af';
      if (p>=0.80){ verdict='Уверенный фаворит'; color='#16a34a'; }
      else if (p>=0.65){ verdict='Фаворит с риском'; color='#f59e0b'; }
      else if (p>=0.55){ verdict='50/50'; color='#9ca3af'; }
      else if (p>=0.40){ verdict='Аутсайдер, но борется'; color='#f97316'; }
      else { verdict='Слабый игрок'; color='#ef4444'; }
      FCI = { FCI: p, verdict, color };
    }
    try { console.info('[AUTO] FCI(main):', FCI); } catch(_) {}
    const htmlFCI = (FCI ? `
      <div class="cmp-row fci" style="display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;font-weight:700;color:${FCI.color};">FCI: ${(FCI.FCI*100).toFixed(1)}%</div>
      </div>
    ` : '');

    holder.innerHTML = htmlTop + htmlCmp + htmlFCI;
    // After initial render, try to update H2H dots strictly from H2H once data arrives
    try {
      const makeDots = (tokensStr) => {
        if (!tokensStr) return '';
        const tokens = String(tokensStr).trim().split(/\s+/).filter(Boolean);
        const mk = (cls, color) => `<span class=\"dot ${cls}\" title=\"${cls==='dot-win'?'win':'loss'}\" style=\"width:8px;height:8px;border-radius:50%;display:inline-block;box-shadow:0 0 0 1px rgba(0,0,0,0.12) inset;margin-right:3px;vertical-align:middle;background:${color};\"></span>`;
        return tokens.map(t => (t === '🟢' ? mk('dot-win', '#22c55e') : mk('dot-loss', '#ef4444'))).join('');
      };
      if (window.__TSX_SERVER_MODE__) return; // skip heavy H2H reconstruction on server
      let attempts = 0;
      const id = setInterval(() => {
        attempts++;
        try {
          const d = buildAnalyzeData({});
          let baseVis = (d?.h2h && typeof d.h2h.visualization === 'string') ? d.h2h.visualization : '';
          if (!baseVis) {
            try {
              const inline = document.getElementById('h2hVizInline');
              if (inline) {
                // Build tokens from existing dot nodes
                const spans = inline.querySelectorAll('.dot');
                const tokens = [];
                spans.forEach(el => { tokens.push(el.classList.contains('dot-win') ? '🟢' : '🔴'); });
                baseVis = tokens.join(' ');
              }
            } catch(_) {}
          }
          const visStr = favIsA ? baseVis : baseVis.replace(/🟢|🔴/g, m => (m === '🟢' ? '🔴' : '🟢'));
          const cell = holder.querySelector('.cmp-row.last10 .fav.last10');
  if (cell) {
            if (visStr && visStr.trim()) {
              cell.innerHTML = makeDots(visStr);
              clearInterval(id);
            } else if (attempts >= 10) {
              cell.innerHTML = '<span style="color:#64748b;">нет H2H</span>';
              clearInterval(id);
            }
          } else {
            clearInterval(id);
          }
        } catch(_) {
          if (attempts >= 10) clearInterval(id);
        }
      }, 500);
    } catch(_) {}
  }

  // Auto-insert compact decision block at the top of the main match container, centered
  function autoInsertDecisionOnMatchPage() {
    const host = (location.hostname || '').toLowerCase();
    const path = location.pathname || '';
    // Focus on match pages we support
    const isSupportedHost = /tennis-score\.pro$|score-tennis\.com$/i.test(host);
    if (!isSupportedHost) return;
    const isMatchPage = /\/mstat\//i.test(path) || /\/mstat$/i.test(path) || document.querySelector('.container-xl.mb-5');
    if (!isMatchPage) return;

    const container = document.querySelector('.container-xl.mb-5');
    if (!container) return;
    if (document.getElementById('tsx-decision-holder')) return; // already inserted

    // Build data for the decision block
    let data = null;
    try { data = buildAnalyzeData({}); } catch(_) { return; }
    if (!data || !data.playerA || !data.playerB) return;

    const a10 = Number(data.playerA.nonBTProbability10 ?? data.playerA.nonBTProbability);
    const b10 = Number(data.playerB.nonBTProbability10 ?? data.playerB.nonBTProbability);
    if (!Number.isFinite(a10) || !Number.isFinite(b10)) return;
    const a5  = Number(data.playerA.nonBTProbability5);
    const b5  = Number(data.playerB.nonBTProbability5);
    const a3  = Number(data.playerA.nonBTProbability3);
    const b3  = Number(data.playerB.nonBTProbability3);
    const favIsA = a10 >= b10;
    const nameA = data?.playerA?.name || 'Игрок 1';
    const nameB = data?.playerB?.name || 'Игрок 2';
    const A = { p10: a10, p5: a5, p3: a3, d5_10: (Number.isFinite(a5)&&Number.isFinite(a10))?(a5-a10):undefined, d3_5: (Number.isFinite(a3)&&Number.isFinite(a5))?(a3-a5):undefined, name: nameA };
    const B = { p10: b10, p5: b5, p3: b3, d5_10: (Number.isFinite(b5)&&Number.isFinite(b10))?(b5-b10):undefined, d3_5: (Number.isFinite(b3)&&Number.isFinite(b5))?(b3-b5):undefined, name: nameB };
    const fav10 = favIsA ? { ...A } : { ...B };
    const opp10 = favIsA ? { ...B } : { ...A };
    const form10 = { p3Fav: fav10.p3, p3Opp: opp10.p3 };
    // Logistic(3) computed with the same model as popup's forecast table
    const p3 = computeModelP3(data);
    let pA3 = Number.isFinite(p3.pA) ? (p3.pA*100) : undefined;
    let pB3 = Number.isFinite(p3.pB) ? (p3.pB*100) : undefined;
    const ml3 = favIsA ? { pFav3: pA3, pOpp3: pB3 } : { pFav3: pB3, pOpp3: pA3 };
    // Non-BT (3): without/with H2H for favorite
    const a3h_dec = Number(data?.playerA?.nonBTProbability3_h2h);
    const b3h_dec = Number(data?.playerB?.nonBTProbability3_h2h);
    const nbNo_dec = favIsA ? a3 : b3;
    const nbWith_dec = favIsA ? a3h_dec : b3h_dec;

    const matchTop = { fav: fav10, opp: opp10, form: form10, ml: ml3, baseProb: fav10.p10, confidence: undefined, favName: fav10.name, oppName: opp10.name, nb3No: nbNo_dec, nb3With: nbWith_dec };
    const html = renderMinTwoSets(matchTop);
    // Add Fav vs Opp compare right under the decision block
    const a3h_dec2 = Number(data?.playerA?.nonBTProbability3_h2h);
    const b3h_dec2 = Number(data?.playerB?.nonBTProbability3_h2h);
    // Compute FCI for decision-attached compare block
    let fciVal_dec = null;
    let committeeVal_dec = null;
    try {
      const fciCtx_dec = {
        favIsA,
        base3: favIsA ? a3 : b3,
        idxFav3: fav10.p3,
        mlFav3: (function(){ const v = favIsA ? pA3 : pB3; return Number.isFinite(v)? v : undefined; })(),
        d5_10: fav10.d5_10,
        d3_5: fav10.d3_5,
        visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
        visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      };
      let FCI_dec = null;
      try { FCI_dec = computeFCI_improved(data, fciCtx_dec); } catch(_) { FCI_dec = null; }
      if (!FCI_dec) {
        const pctTo01 = (x)=> (typeof x==='number'? Math.max(0,Math.min(1,x/100)) : null);
        const base3p = pctTo01(favIsA ? a3 : b3);
        const logit3p = pctTo01(favIsA ? pA3 : pB3);
        const proxy = (base3p!=null? base3p : (logit3p!=null? logit3p : 0.5));
        FCI_dec = { FCI: proxy, verdict: '', color: '#111827' };
      }
      // Prefer UI value if present (from minimal forecast title)
      let fciUI = null;
      try {
        const mf = document.getElementById('mfTitle');
        const txt = mf ? (mf.innerText || mf.textContent || '') : '';
        const mm = String(txt).match(/FCI\s*:\s*(\d{1,3})%/i);
        if (mm) { const vv = Number(mm[1]); if (isFinite(vv)) fciUI = vv; }
      } catch(_) {}
      fciVal_dec = (fciUI!=null) ? fciUI : Math.round((FCI_dec.FCI||0)*100);
    } catch(_) {}
    // Compute Committee% oriented to favorite for this block
    try {
      const pA_fore01 = (typeof data?.forecast?.pA === 'number') ? data.forecast.pA : (typeof data?.predWinProbA==='number'? data.predWinProbA/100 : null);
      const pB_fore01 = (typeof data?.forecast?.pB === 'number') ? data.forecast.pB : (typeof data?.predWinProbB==='number'? data.predWinProbB/100 : null);
      const v = favIsA ? pA_fore01 : (pB_fore01!=null? (1-pB_fore01) : null);
      if (typeof v === 'number' && isFinite(v)) committeeVal_dec = Math.round(v*100);
    } catch(_) {}
    if (committeeVal_dec == null) {
      try {
        const sv = document.getElementById('summaryFav');
        const st = sv ? (sv.innerText || sv.textContent || '') : '';
        const ms = String(st).match(/Комитет\s*\(калибр\.\)\s*:\s*(\d{1,3})%/i);
        if (ms) { const vv = Number(ms[1]); if (isFinite(vv)) committeeVal_dec = vv; }
      } catch(_) {}
    }
    const cmpPayload_dec2 = {
      favName: fav10.name,
      oppName: opp10.name,
      nbFavNo: favIsA ? a3 : b3,
      nbFavWith: favIsA ? a3h_dec2 : b3h_dec2,
      nbOppNo: favIsA ? b3 : a3,
      nbOppWith: favIsA ? b3h_dec2 : a3h_dec2,
      mlFav3: Number.isFinite(pA3) && Number.isFinite(pB3) ? (favIsA ? pA3 : pB3) : undefined,
      mlOpp3: Number.isFinite(pA3) && Number.isFinite(pB3) ? (favIsA ? pB3 : pA3) : undefined,
      idxFav3: fav10.p3,
      idxOpp3: opp10.p3,
      d3_5Fav: (typeof fav10?.d3_5 === 'number') ? fav10.d3_5 : null,
      d3_5Opp: (typeof opp10?.d3_5 === 'number') ? opp10.d3_5 : null,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      fciFavPct: (typeof fciVal_dec === 'number') ? fciVal_dec : undefined,
      committeePct: (typeof committeeVal_dec === 'number') ? committeeVal_dec : undefined
    };
    const htmlCmp2 = renderFavOppCompare(cmpPayload_dec2);

    const holder = document.createElement('div');
    holder.id = 'tsx-decision-holder';
    holder.style.display = 'flex';
    holder.style.justifyContent = 'center';
    holder.style.margin = '10px 0';
    const inner = document.createElement('div');
    inner.style.maxWidth = '760px';
    inner.style.width = '100%';
    inner.innerHTML = html + htmlCmp2;
    holder.appendChild(inner);
    container.insertBefore(holder, container.firstChild);
    // Try to refresh H2H dots strictly from H2H (the popup extractor may load H2H slightly later)
    try {
      const makeDots = (tokensStr) => {
        if (!tokensStr) return '';
        const tokens = String(tokensStr).trim().split(/\s+/).filter(Boolean);
        const mk = (cls, color) => `<span class=\"dot ${cls}\" title=\"${cls==='dot-win'?'win':'loss'}\" style=\"width:8px;height:8px;border-radius:50%;display:inline-block;box-shadow:0 0 0 1px rgba(0,0,0,0.12) inset;margin-right:3px;vertical-align:middle;background:${color};\"></span>`;
        return tokens.map(t => (t === '🟢' ? mk('dot-win', '#22c55e') : mk('dot-loss', '#ef4444'))).join('');
      };
      if (window.__TSX_SERVER_MODE__) return; // skip heavy H2H reconstruction on server
      let attempts = 0;
      const id = setInterval(() => {
        attempts++;
        try {
          const d = buildAnalyzeData({});
          let baseVis = (d?.h2h && typeof d.h2h.visualization === 'string') ? d.h2h.visualization : '';
          if (!baseVis) {
            try {
              const inline = document.getElementById('h2hVizInline');
              if (inline) {
                const spans = inline.querySelectorAll('.dot');
                const tokens = [];
                spans.forEach(el => { tokens.push(el.classList.contains('dot-win') ? '🟢' : '🔴'); });
                baseVis = tokens.join(' ');
              }
            } catch(_) {}
          }
          const visStr = favIsA ? baseVis : baseVis.replace(/🟢|🔴/g, m => (m === '🟢' ? '🔴' : '🟢'));
          const cell = holder.querySelector('.cmp-row.last10 .fav.last10');
          if (cell) {
            if (visStr && visStr.trim()) {
              cell.innerHTML = makeDots(visStr);
              clearInterval(id);
            } else if (attempts >= 10) {
              cell.innerHTML = '<span style="color:#64748b;">нет H2H</span>';
              clearInterval(id);
            }
          } else {
            clearInterval(id);
          }
        } catch(_) {
          if (attempts >= 10) clearInterval(id);
        }
      }, 500);
    } catch(_) {}
  }

  // Targeted insertion: place the "take-two-sets" block before a specific player name on tennis-score.pro/stats
  function autoInsertForTSProStats() {
    const host = location.hostname || '';
    const path = location.pathname || '';
    if (!/tennis-score\.pro$/i.test(host)) return;
    if (!path.startsWith('/stats')) return;
    insertMinTwoBeforeName('Дмитрий Кугурушев');
  }

  function insertMinTwoBeforeName(targetName) {
    if (!targetName) return;
    if (document.getElementById('tsx-min2-before-target')) return; // already inserted
    const candidates = Array.from(document.querySelectorAll('.gamer-name.pr-2'));
    const target = candidates.find((el) => (el.textContent || '').trim() === targetName);
    if (!target) return;

    // Build data and render the MinTwoSets block (top compact summary)
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
    const A = { p10: a10, p5: a5, p3: a3, d5_10: (Number.isFinite(a5)&&Number.isFinite(a10))?(a5-a10):undefined, d3_5: (Number.isFinite(a3)&&Number.isFinite(a5))?(a3-a5):undefined, name: nameA };
    const B = { p10: b10, p5: b5, p3: b3, d5_10: (Number.isFinite(b5)&&Number.isFinite(b10))?(b5-b10):undefined, d3_5: (Number.isFinite(b3)&&Number.isFinite(b5))?(b3-b5):undefined, name: nameB };
    const fav10 = favIsA ? { ...A } : { ...B };
    const opp10 = favIsA ? { ...B } : { ...A };
    const form10 = { p3Fav: fav10.p3, p3Opp: opp10.p3 };
    // Logistic(3) computed with the same model as popup's forecast table
    const p3b = computeModelP3(data);
    const pA3_win = Number.isFinite(p3b.pA) ? (p3b.pA*100) : undefined;
    const pB3_win = Number.isFinite(p3b.pB) ? (p3b.pB*100) : undefined;
    const ml3 = favIsA ? { pFav3: pA3_win, pOpp3: pB3_win } : { pFav3: pB3_win, pOpp3: pA3_win };
    // Non-BT (3): without/with H2H for favorite
    const a3h_ins = Number(data?.playerA?.nonBTProbability3_h2h);
    const b3h_ins = Number(data?.playerB?.nonBTProbability3_h2h);
    const nbNo_ins = favIsA ? a3 : b3;
    const nbWith_ins = favIsA ? a3h_ins : b3h_ins;
    const matchTop = { fav: fav10, opp: opp10, form: form10, ml: ml3, baseProb: fav10.p10, confidence: undefined, favName: fav10.name, oppName: opp10.name, nb3No: nbNo_ins, nb3With: nbWith_ins };

    const htmlTop = renderMinTwoSets(matchTop);
    const holder = document.createElement('div');
    holder.id = 'tsx-min2-before-target';
    holder.style.width = '100%';
    holder.style.boxSizing = 'border-box';
    // Build last-10 series tokens: STRICTLY H2H; if none — unavailable
    const favH2H10_t = (favIsA ? (Array.isArray(data.h2hOrientedA)?data.h2hOrientedA:[]) : (Array.isArray(data.h2hOrientedB)?data.h2hOrientedB:[])).slice(0,10);
    const tokens_t = favH2H10_t.map(m => { const own=Number(m?.finalScoreOwnOpponent?.own)||0; const opp=Number(m?.finalScoreOwnOpponent?.opponent)||0; return own>opp?'🟢':'🔴'; });
    // Build compare block payload with last-10 series tokens
    const cmpPayload_ins2 = {
      favName: fav10.name,
      oppName: opp10.name,
      nbFavNo: nbNo_ins,
      nbFavWith: nbWith_ins,
      nbOppNo: favIsA ? b3 : a3,
      nbOppWith: favIsA ? b3h_ins : a3h_ins,
      mlFav3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pA3_win : pB3_win) : undefined,
      mlOpp3: Number.isFinite(pA3_win) && Number.isFinite(pB3_win) ? (favIsA ? pB3_win : pA3_win) : undefined,
      idxFav3: fav10.p3,
      idxOpp3: opp10.p3,
      d3_5Fav: (typeof fav10?.d3_5 === 'number') ? fav10.d3_5 : null,
      d3_5Opp: (typeof opp10?.d3_5 === 'number') ? opp10.d3_5 : null,
      last10Avail: favH2H10_t.length > 0,
      last10Tokens: favH2H10_t.length > 0 ? tokens_t.join(' ') : null
    };
    // htmlCmp_ins2 будет создан ниже после добавления FCI/committee в payload

    // FCI v2.0 block for this insertion path
    const computeFCI_local = (data, ctx) => { try { return computeFCI_improved(data, ctx); } catch(_) { return null; } };

    const fciCtx2 = {
      favIsA,
      base3: favIsA ? a3 : b3,
      idxFav3: fav10.p3,
      mlFav3: (function(){ const v = favIsA ? pA3_win : pB3_win; return Number.isFinite(v)? v : undefined; })(),
      d5_10: fav10.d5_10,
      d3_5: fav10.d3_5,
      visFavTokens: String(data?.playerA?.visualization||'').split(/\s+/).slice(0,10).join(' '),
      visOppTokens: String(data?.playerB?.visualization||'').split(/\s+/).slice(0,10).join(' '),
    };
    let FCI2 = computeFCI_local(data, fciCtx2);
    if (!FCI2) {
      const pctTo01 = (x)=> (typeof x==='number'? Math.max(0,Math.min(1,x/100)) : null);
      const base3p = pctTo01(favIsA ? a3 : b3);
      const logit3p = (function(){ const v = favIsA ? pA3_win : pB3_win; return pctTo01(v); })();
      const proxy = (base3p!=null? base3p : (logit3p!=null? logit3p : 0.5));
      const p = Math.max(0,Math.min(1, proxy));
      let verdict='Равные шансы', color='#9ca3af';
      if (p>=0.80){ verdict='Уверенный фаворит'; color='#16a34a'; }
      else if (p>=0.65){ verdict='Фаворит с риском'; color='#f59e0b'; }
      else if (p>=0.55){ verdict='50/50'; color='#9ca3af'; }
      else if (p>=0.40){ verdict='Аутсайдер, но борется'; color='#f97316'; }
      else { verdict='Слабый игрок'; color='#ef4444'; }
      FCI2 = { FCI: p, verdict, color };
    }
    // Pass inside compare-block as row
    // Prefer UI-rendered FCI if present, else computed
    try {
      let fciUI = null;
      const mf = document.getElementById('mfTitle');
      const txt = mf ? (mf.innerText || mf.textContent || '') : '';
      const mm = String(txt).match(/FCI\s*:\s*(\d{1,3})%/i);
      if (mm) { const vv = Number(mm[1]); if (isFinite(vv)) fciUI = vv; }
      if (fciUI!=null) cmpPayload_ins2.fciFavPct = fciUI;
      else if (FCI2 && typeof FCI2.FCI==='number') cmpPayload_ins2.fciFavPct = Math.round(FCI2.FCI*100);
    } catch(_) {}
    // Committee % for this path
    try {
      const pA_fore01 = (typeof data?.forecast?.pA === 'number') ? data.forecast.pA : (typeof data?.predWinProbA==='number'? data.predWinProbA/100 : null);
      const pB_fore01 = (typeof data?.forecast?.pB === 'number') ? data.forecast.pB : (typeof data?.predWinProbB==='number'? data.predWinProbB/100 : null);
      const v = favIsA ? pA_fore01 : (pB_fore01!=null? (1-pB_fore01) : null);
      if (typeof v==='number' && isFinite(v)) cmpPayload_ins2.committeePct = Math.round(v*100);
    } catch(_) {}
    // Fallback: read from globalSummary UI block
    try {
      if (typeof cmpPayload_ins2.committeePct !== 'number'){
        const sv = document.getElementById('summaryFav');
        const st = sv ? (sv.innerText || sv.textContent || '') : '';
        const ms = String(st).match(/Комитет\s*\(калибр\.\)\s*:\s*(\d{1,3})%/i);
        if (ms) { const vv = Number(ms[1]); if (isFinite(vv)) cmpPayload_ins2.committeePct = vv; }
      }
    } catch(_) {}
    try { console.info('[AUTO] FCI(insert):', FCI2); } catch(_) {}
    const htmlFCI2 = (FCI2 ? `
      <div class="cmp-row fci" style="display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;">
        <div style="padding:8px 10px;font-weight:700;color:${FCI2.color};">FCI: ${(FCI2.FCI*100).toFixed(1)}%</div>
      </div>
    ` : '');
    const htmlCmp_ins2 = renderFavOppCompare(cmpPayload_ins2);
    holder.innerHTML = htmlTop + htmlCmp_ins2 + htmlFCI2;

    // Prefer to place above the overall score/header block if present
    const topHeader = document.querySelector('.table-top');
    if (topHeader && topHeader.parentNode) {
      topHeader.parentNode.insertBefore(holder, topHeader);
    } else {
      // Fallback: before target player name
      target.parentNode?.insertBefore(holder, target);
    }
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

// --- Ensure inline FCI appears right before <pre id="favImproved"> ---
function ensureFCIInline() {
  if (window.__TSX_SERVER_MODE__) return; // server mode: skip extra compute
  try {
    const anchor = document.getElementById('favImproved');
    if (!anchor) return;
    if (document.getElementById('tsx-fci-inline')) return; // already inserted

    // Retry helper: some data arrives later; try a few times
    const scheduleRetry = () => {
      try {
        window.__fciInlineTries = (window.__fciInlineTries||0) + 1;
        if (window.__fciInlineTries <= 12) setTimeout(ensureFCIInline, 400);
      } catch(_) {}
    };

    // Build data
    let data = null;
    try { data = buildAnalyzeData({}); } catch(_) { scheduleRetry(); return; }
    if (!data || !data.playerA || !data.playerB) { scheduleRetry(); return; }
    const a10 = Number(data.playerA.nonBTProbability10 ?? data.playerA.nonBTProbability);
    const b10 = Number(data.playerB.nonBTProbability10 ?? data.playerB.nonBTProbability);
    // Determine favorite orientation: prefer p10; fallback to compare-block header
    let favIsA = true;
    if (Number.isFinite(a10) && Number.isFinite(b10)) {
      favIsA = a10 >= b10;
    } else {
      try {
        const head = document.querySelector('.min2-compare .cmp-head');
        if (head) favIsA = true; // left column is favorite in our compare block
      } catch(_) { /* keep default */ }
    }
    const a3  = Number(data.playerA.nonBTProbability3);
    const b3  = Number(data.playerB.nonBTProbability3);
    const fav10 = favIsA ? { p3: Number(data.playerA.nonBTProbability3), d5_10: (Number(data.playerA.nonBTProbability5)-Number(data.playerA.nonBTProbability10)), d3_5: (Number(data.playerA.nonBTProbability3)-Number(data.playerA.nonBTProbability5)) }
                         : { p3: Number(data.playerB.nonBTProbability3), d5_10: (Number(data.playerB.nonBTProbability5)-Number(data.playerB.nonBTProbability10)), d3_5: (Number(data.playerB.nonBTProbability3)-Number(data.playerB.nonBTProbability5)) };
    const p3b = computeModelP3(data);
    const pA3_win = Number.isFinite(p3b.pA) ? (p3b.pA*100) : undefined;
    const pB3_win = Number.isFinite(p3b.pB) ? (p3b.pB*100) : undefined;

    // Compute FCI (fallback-safe)
    const pct01 = (x)=> (typeof x==='number' && isFinite(x) ? Math.max(0,Math.min(1,x/100)) : null);
    const base3 = pct01(favIsA ? a3 : b3);
    const form3 = pct01(fav10.p3);
    const logit3 = pct01(favIsA ? pA3_win : pB3_win);
    // MBT from last-5 visualization tokens
    const toArr = (s)=> String(s||'').trim().split(/\s+/).filter(Boolean).map(t=>t==='🟢'?1:(t==='🔴'?0:null)).filter(v=>v!=null).slice(0,5);
    const f5 = toArr(String(data?.playerA?.visualization||''));
    const o5 = toArr(String(data?.playerB?.visualization||''));
    const p1 = f5.length? f5.reduce((a,b)=>a+b,0)/f5.length : null;
    const p2 = o5.length? o5.reduce((a,b)=>a+b,0)/o5.length : null;
    const mbt = (p1!=null && p2!=null && (p1+p2)>0) ? (p1/(p1+p2)) : null;
    // Committee probability (calibrated forecast/pred)
    const pA_fore = (typeof data?.forecast?.pA === 'number') ? data.forecast.pA : (typeof data?.predWinProbA==='number'? data.predWinProbA/100 : null);
    const pB_fore = (typeof data?.forecast?.pB === 'number') ? data.forecast.pB : (typeof data?.predWinProbB==='number'? data.predWinProbB/100 : null);
    const committee = (favIsA ? pA_fore : (pB_fore!=null? (1-pB_fore) : null));
    // Stability (0..1) for favorite
    const stability = favIsA ? (typeof data?.playerA?.stability==='number'? data.playerA.stability : null)
                             : (typeof data?.playerB?.stability==='number'? data.playerB.stability : null);
    // Weights (adaptive lite, with renorm)
    let w = { base:0.20, form:0.20, logit:0.15, mbt:0.30, committee:0.10, stab:0.05 };
    if (typeof fav10.d5_10==='number' && fav10.d5_10 < -5) w.base = 0.15;
    if (typeof form3==='number' && form3 > 0.65) w.form = 0.25;
    if (typeof logit3==='number' && logit3 < 0.5) w.logit = 0.10;
    if (typeof form3==='number' && typeof logit3==='number' && form3 > 0.6 && logit3 > 0.55) w.mbt = 0.35;
    // Use improved consensus calculator and render once
    const res = computeFCI_improved(data, {
      favIsA,
      mlFav3: (function(){ const v=favIsA? pA3_win : pB3_win; return Number.isFinite(v)? v : undefined; })(),
      idxFav3: fav10.p3
    });
    const node = document.createElement('div');
    node.id = 'tsx-fci-inline';
    node.className = 'cmp-row fci';
    node.setAttribute('style', 'display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;margin-bottom:6px;');
    const color = res?.color || '#9ca3af';
    const val = (res && typeof res.FCI==='number') ? (res.FCI*100).toFixed(1) + '%' : '—';
    node.innerHTML = `<div style=\"padding:8px 10px;font-weight:700;color:${color};\">FCI: ${val}</div>`;
    anchor.parentNode.insertBefore(node, anchor);
  } catch(_) {}
}

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
    const clamp01b = (x)=> Math.max(0, Math.min(1, Number(x)||0));
    const ema = (arr, a)=>{
      if (!Array.isArray(arr) || arr.length===0) return 0.5;
      let s = Number(arr[0])||0; for (let i=1;i<arr.length;i++){ s = a*(Number(arr[i])||0) + (1-a)*s; }
      return clamp01b(s);
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
      return { F_slow, F_fast, F_final: clamp01b(F_raw * fresh) };
    };
    const FA = F_build(recA10, playerA?.pointsSummary5?.diff, playerA?.stats?.pointsSummary10?.diff, playerA?.stats?.lastGameDays, out.h2hOrientedA);
    const FB = F_build(recB10, playerB?.pointsSummary5?.diff, playerB?.stats?.pointsSummary10?.diff, playerB?.stats?.lastGameDays, out.h2hOrientedB);
    out.playerA.F_slow = FA.F_slow; out.playerA.F_fast = FA.F_fast; out.playerA.F_final = FA.F_final;
    out.playerB.F_slow = FB.F_slow; out.playerB.F_fast = FB.F_fast; out.playerB.F_final = FB.F_final;
    const pd10A = Number(playerA?.stats?.pointsSummary10?.diff)||0;
    const pd10B = Number(playerB?.stats?.pointsSummary10?.diff)||0;
    const EXT_A = extFromPatterns(playerA?.patterns), EXT_B = extFromPatterns(playerB?.patterns);
    const STAB_A = clamp01b(playerA?.stability||0); const STAB_B = clamp01b(playerB?.stability||0);
    const h2hTot = Number(out?.h2h?.summary?.A?.total||0);
    const h2hA = Number(out?.h2h?.summary?.A?.wins||0); const h2hB = Number(out?.h2h?.summary?.B?.wins||0);
    const h2hScoreA = h2hTot>0 ? (h2hA/h2hTot) : 0.5; const h2hScoreB = h2hTot>0 ? (h2hB/h2hTot) : 0.5;
    const S_star = (Ff, pd10, EXT, STAB, h2h) => {
      let S = 0.35*clamp01b(Ff) + 0.25*clamp01b(pd10/50) + 0.15*clamp01b(EXT/100) + 0.15*clamp01b(STAB) + 0.10*clamp01b(h2h);
      if (Math.abs(pd10) > 40) S *= 0.8;
      return clamp01b(S);
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

  // Compute logistic probabilities for windows N=10/5/3 and expose them
  try {
    const computeWeightedFeaturesN = (arr, N=10, alpha = 0.85) => {
      const L = (arr || []).slice(0, N);
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
        for (const [a0, b0] of sets) {
          const a = Number(a0) || 0, b = Number(b0) || 0;
          ptsDiffW += w * (a - b);
          ptsTotCountW += w * 1;
          if (Math.abs(a - b) <= 2) tightCntW += w * 1;
        }
        setsTotW += w * (em.ownSets + em.oppSets);
      }
      const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
      const F = (winsW + lossesW) > 0 ? (winsW - lossesW) / (winsW + lossesW) : 0;
      const S = setsTotW > 0 ? (setsWinW - setsLossW) / setsTotW : 0;
      const D = ptsTotCountW > 0 ? (ptsDiffW / ptsTotCountW) / 11 : 0;
      const T = ptsTotCountW > 0 ? (tightCntW / ptsTotCountW) : 0;
      return { F: clamp(F, -1, 1), S: clamp(S, -1, 1), D: clamp(D, -1, 1), T: clamp(T, -1, 1), setsTotal: setsTotW };
    };
    const windowLogistic = (recA, recB, h2hA, h2hB, N=10) => {
      try {
        const featA = computeWeightedFeaturesN(recA, N);
        const featB = computeWeightedFeaturesN(recB, N);
        const h2hFeatA = computeWeightedFeaturesN(h2hA, Math.min(N, 10));
        const h2hFeatB = computeWeightedFeaturesN(h2hB, Math.min(N, 10));
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
        const setsVol = Math.max(0, Math.min(1, (featA.setsTotal + featB.setsTotal) / 40));
        const h2hVol = Math.max(0, Math.min(1, ((h2hFeatA.setsTotal||0) + (h2hFeatB.setsTotal||0)) / 20));
        const tau = 2.0 - 0.6*setsVol - 0.3*h2hVol;
        const shrink = 0.65 + 0.15*(setsVol + 0.5*h2hVol);
        const clipLo = 0.22 - 0.04*(setsVol + 0.5*h2hVol);
        const clipHi = 1 - clipLo;
        const pTemp = 1/(1+Math.exp(-(z/Math.max(1e-6,tau))));
        let pCal = 0.5 + shrink*(pTemp - 0.5);
        pCal = Math.max(clipLo, Math.min(clipHi, pCal));
        const pA01 = pCal; const pB01 = 1 - pA01;
        return [Math.round(pA01*100), Math.round(pB01*100)];
      } catch(_) { return [null, null]; }
    };
    const recA = (playerA && Array.isArray(out.recentsA10)) ? out.recentsA10 : [];
    const recB = (playerB && Array.isArray(out.recentsB10)) ? out.recentsB10 : [];
    const h2hA = Array.isArray(out.h2hOrientedA) ? out.h2hOrientedA : [];
    const h2hB = Array.isArray(out.h2hOrientedB) ? out.h2hOrientedB : [];
    const [pA10, pB10] = windowLogistic(recA, recB, h2hA, h2hB, 10);
    const [pA5,  pB5 ] = windowLogistic(recA, recB, h2hA, h2hB, 5);
    const [pA3,  pB3 ] = windowLogistic(recA, recB, h2hA, h2hB, 3);
    out.logistic = { pA10, pB10, pA5, pB5, pA3, pB3 };
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

})();

// Force-inject FCI and Committee rows into any .min2-compare if missing.
(function(){
  function readFciFromUI(){
    try{ const el=document.getElementById('mfTitle'); const t=el?(el.innerText||el.textContent||''):''; const m=String(t).match(/FCI\s*:\s*(\d{1,3})%/i); if(m){ const v=+m[1]; if(isFinite(v)) return v; } }catch(_){ }
    return null;
  }
  function readCommitteeFromUI(){
    try{ const el=document.getElementById('summaryFav'); const t=el?(el.innerText||el.textContent||''):''; const m=String(t).match(/Комитет\s*\(калибр\.\)\s*:\s*(\d{1,3})%/i); if(m){ const v=+m[1]; if(isFinite(v)) return v; } }catch(_){ }
    return null;
  }
  function injectOnce(root){
    const fci = readFciFromUI();
    const comm = readCommitteeFromUI();
    if (fci==null && comm==null) return;
    const blocks = root.querySelectorAll('.min2-compare');
    blocks.forEach(bl=>{
      const head = bl.querySelector('.cmp-head'); if(!head) return;
      const favName = ((head.querySelector('div:first-child')||{}).textContent||'').trim() || 'Фаворит';
      const firstRow = bl.querySelector('.cmp-row.nb3') || bl.children[1];
      if (fci!=null && !bl.querySelector('.cmp-row.fci')){
        const row=document.createElement('div'); row.className='cmp-row fci';
        row.setAttribute('style','display:grid;grid-template-columns:1fr;gap:0;border-bottom:1px solid #f1f1f1;background:#fcfcfc;');
        row.innerHTML = `<div style="padding:8px 10px;font-weight:700;">${favName} — FCI: ${fci}%</div>`;
        if(firstRow && firstRow.parentNode) firstRow.parentNode.insertBefore(row, firstRow); else bl.appendChild(row);
      }
      if (comm!=null && !bl.querySelector('.cmp-row.committee')){
        const row=document.createElement('div'); row.className='cmp-row committee';
        row.setAttribute('style','display:grid;grid-template-columns:1fr;gap:0;border-bottom:1px solid #f1f1f1;background:#fcfcfc;');
        row.innerHTML = `<div style="padding:8px 10px;font-weight:700;">${favName} — Комитет (калибр.): ${comm}%</div>`;
        const after = bl.querySelector('.cmp-row.fci') || firstRow;
        if (after && after.nextSibling) bl.insertBefore(row, after.nextSibling); else bl.appendChild(row);
      }
    });
  }
  try { injectOnce(document); } catch(_){ }
  try {
    const mo = new MutationObserver(()=>{ try{ injectOnce(document); }catch(_){ } });
    mo.observe(document.documentElement, { subtree:true, childList:true });
    // Reduce background polling; mutations usually suffice
    if (!window.__TSX_SERVER_MODE__) {
      setInterval(()=>{ try{ injectOnce(document); }catch(_){ } }, 5000);
    }
  } catch(_){ }
})();
