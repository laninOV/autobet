document.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const results = document.getElementById('results');

  // Unified highlighting helpers
  const resetHL = (el) => {
    if (!el) return;
    el.classList.remove('metric-good','metric-highlight','metric-bad','metric-green-light','metric-green-strong','metric-danger','favorite-value');
  };
  const applyTier = (el, tier) => {
    if (!el) return;
    resetHL(el);
    if (tier === 'good') el.classList.add('metric-good');
    else if (tier === 'warn') el.classList.add('metric-highlight');
    else if (tier === 'bad') el.classList.add('metric-bad');
  };
  const tierByPct = (p, {higherBetter = true, good = 0.65, warn = 0.50, bad = 0.35} = {}) => {
    if (p == null || isNaN(p)) return null;
    const v = Math.max(0, Math.min(1, p));
    if (higherBetter) {
      if (v >= good) return 'good';
      if (v >= warn) return 'warn';
      if (v <= bad) return 'bad';
    } else {
      if (v <= (1 - good)) return 'good';
      if (v <= (1 - warn)) return 'warn';
      if (v >= (1 - bad)) return 'bad';
    }
    return null;
  };
  const tierByDiff = (diff, {good = 15, warn = 8} = {}) => {
    if (diff >= good) return 'good';
    if (diff <= -good) return 'bad';
    if (diff >= warn) return 'warn';
    if (diff <= -warn) return 'warn';
    return null;
  };

  // Patterns-specific helpers
  const hlPctPositive = (el, v, peer = null) => { // higher is better
    if (!el) return;
    if (v == null || Number.isNaN(v)) { resetHL(el); return; }
    let tier = null;
    const peerValid = typeof peer === 'number' && !Number.isNaN(peer);
    if (peerValid) {
      const delta = v - peer;
      // Оба высокие — оба зелёные
      if (v >= 0.80 && peer >= 0.80) {
        tier = 'good';
      } else {
        // Базовый уровень по абсолютным зонам
        if (v >= 0.70) tier = 'good';
        else if (v >= 0.35) tier = 'warn';
        else tier = 'bad';
        // Коррекция разницей
        if (delta >= 0.20) {
          // Промоут в good только если абсолют ≥ 0.55, иначе warn
          tier = v >= 0.55 ? 'good' : 'warn';
        } else if (delta >= 0.06) {
          // Лёгкое преимущество → не выше warn, если абсолют < 0.70
          if (tier === 'bad') tier = 'warn';
        } else if (delta <= -0.20) {
          // Сильное отставание → красный лишь при низком абсолюте
          tier = v >= 0.30 ? 'warn' : 'bad';
        } else if (delta <= -0.06) {
          // Небольшое отставание → warn
          if (tier === 'good') tier = v >= 0.75 ? 'good' : 'warn';
          else if (tier === 'bad') tier = 'warn';
        }
      }
    } else {
      // Без пира: по абсолютным порогам
      if (v >= 0.70) tier = 'good';
      else if (v >= 0.35) tier = 'warn';
      else tier = 'bad';
    }
    applyTier(el, tier);
  };
  const hlPctNegative = (el, v, peer = null) => { // lower is better
    if (!el) return;
    if (v == null || Number.isNaN(v)) { resetHL(el); return; }
    let tier = null;
    const peerValid = typeof peer === 'number' && !Number.isNaN(peer);
    if (peerValid) {
      const delta = peer - v; // положительный delta → лучше (ниже)
      if (v <= 0.22 && delta >= -0.02) {
        tier = 'good';
      } else if (v >= 0.60 && delta <= 0.02) {
        tier = 'bad';
      } else if (delta >= 0.12) {
        tier = 'good';
      } else if (delta >= 0.06) {
        tier = 'warn';
      } else if (delta <= -0.12) {
        tier = 'bad';
      } else if (delta <= -0.06) {
        tier = 'warn';
      } else if (v >= 0.55) {
        tier = 'bad';
      } else if (v <= 0.30) {
        tier = 'warn';
      }
    } else {
      if (v <= 0.25) tier = 'good';
      else if (v <= 0.40) tier = 'warn';
      else if (v >= 0.55) tier = 'bad';
    }
    applyTier(el, tier);
  };
  const hlCount = (el, n) => {
    if (n == null) { resetHL(el); return; }
    if (n >= 2) applyTier(el, 'good');
    else if (n === 1) applyTier(el, 'warn');
    else resetHL(el);
  };
  const hlSignedDiff = (el, diff) => {
    if (diff == null || isNaN(diff)) { resetHL(el); return; }
    if (diff >= 6) applyTier(el, 'good');
    else if (diff >= 3) applyTier(el, 'warn');
    else if (diff <= -3) applyTier(el, 'bad');
    else resetHL(el);
  };

  function formatVisualization(visStr) {
    if (!visStr) return '';
    // Expect tokens separated by space, like "🟢 🔴 🟢 ..."
    const tokens = String(visStr).trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const tk of tokens) {
      if (tk === '🟢') out.push('<span class="dot dot-win" title="win"></span>');
      else if (tk === '🔴') out.push('<span class="dot dot-loss" title="loss"></span>');
      // ignore anything else silently to avoid broken visuals
    }
    return out.join('');
  }

  // Универсальный бейдж надёжности (отключён)
  function renderReliabilityBadge(_total, _opts = {}) { return ''; }

  function makeRecommendation(d) {
    // Убираем проверку red flags - больше не используем

    const pa = parseFloat(d.playerA.probability);
    const pb = parseFloat(d.playerB.probability);
    const sa = parseFloat(d.playerA.strength);
    const sb = parseFloat(d.playerB.strength);
    const dryA = parseInt(d.playerA.dryWins, 10);
    const dryB = parseInt(d.playerB.dryWins, 10);
    const btA = parseFloat(d.bt_pSetA ?? 0.5);
    const btB = parseFloat(d.bt_pSetB ?? 0.5);
    const btFavorite = d.bt_favorite;
    const btPMatch = parseFloat(d.bt_p_match ?? 0.5);

    const weights = {
      probabilityDiff: 2,
      strengthDiff: 1,
      h2hAdv: 0.5,
      dryWins: 0.2,
      btAdv: 0.4
    };

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    const scores = { A: 0, B: 0 };
    const reasonsA = [];
    const reasonsB = [];

    if (pa > pb + 5) { scores.A += weights.probabilityDiff; reasonsA.push("Высокая вероятность"); }
    if (pb > pa + 5) { scores.B += weights.probabilityDiff; reasonsB.push("Высокая вероятность"); }
    if (sa > sb + 2) { scores.A += weights.strengthDiff;    reasonsA.push("Больше сила"); }
    if (sb > sa + 2) { scores.B += weights.strengthDiff;    reasonsB.push("Больше сила"); }
    const [hA, hB] = d.playerA.h2h.split('-').map(x => parseInt(x, 10));
    if (hA > hB) { scores.A += weights.h2hAdv; reasonsA.push("Лучшие H2H"); }
    if (hB > hA) { scores.B += weights.h2hAdv; reasonsB.push("Лучшие H2H"); }
    if (dryA > dryB + 2) { scores.A += weights.dryWins; reasonsA.push("Чаще выигрывает всухую"); }
    if (dryB > dryA + 2) { scores.B += weights.dryWins; reasonsB.push("Чаще выигрывает всухую"); }
    if (btA > btB + 0.1) { scores.A += weights.btAdv; reasonsA.push("Лучше (BT) по сетам"); }
    if (btB > btA + 0.1) { scores.B += weights.btAdv; reasonsB.push("Лучше (BT) по сетам"); }
    
    // Дополнительный бонус за высокую вероятность матча по BT
    if (btFavorite === d.playerA.name && btPMatch > 0.7) {
      scores.A += 0.3; reasonsA.push("Высокая вероятность по BT модели");
    }
    if (btFavorite === d.playerB.name && btPMatch > 0.7) {
      scores.B += 0.3; reasonsB.push("Высокая вероятность по BT модели");
    }

    let verdictText = '';
    let favorite = null;
    let favScore = 0;

    if (scores.A - scores.B > 1.2) {
      verdictText = `Фаворит: ${d.playerA.name} (ЗА)\nПричины: ${reasonsA.join(', ')}`;
      favorite = d.playerA.name;
      favScore = scores.A;
    } else if (scores.B - scores.A > 1.2) {
      verdictText = `Фаворит: ${d.playerB.name} (ЗА)\nПричины: ${reasonsB.join(', ')}`;
      favorite = d.playerB.name;
      favScore = scores.B;
    } else {
      verdictText = `Равные шансы или высокая неопределённость — аккуратнее!\nЗА ${d.playerA.name}: ${reasonsA.join(', ') || 'нет ярких причин'}\nЗА ${d.playerB.name}: ${reasonsB.join(', ') || 'нет ярких причин'}`;
      favorite = null;
      favScore = 0;
    }

    return { verdictText, favorite, favScore, totalWeight, isRedFlag: false };
  }

  // Убираем блок рекомендаций - больше не используем

  // Betting recommendation function removed - block no longer exists

  function fillTop3Tables(d) {
    const fillTop = (list, bodyEl) => {
      if (!bodyEl || !Array.isArray(list)) return;
      const top3 = [...list]
        .sort((a, b) => {
          const cap01 = (x)=>{ const v = (typeof x==='number')? x : parseFloat(x)/100; return Math.max(0, Math.min(1, isNaN(v)?0:v)); };
          const pa = cap01(a.probability);
          const pb = cap01(b.probability);
          return pb - pa;
        })
        .slice(0, 3);
      bodyEl.innerHTML = top3.map((item) => {
        const cap01 = (x)=>{ const v=(typeof x==='number')?x:parseFloat(x)/100; return Math.max(0.005, Math.min(0.995, isNaN(v)?0:v)); };
        let probability;
        if (typeof item.probability === 'number') probability = (cap01(item.probability) * 100).toFixed(1) + '%';
        else if (typeof item.label === 'string' && item.label.includes('%')) probability = item.label;
        else probability = (cap01(item.probability) * 100).toFixed(1) + '%';
        const score = item.score || item.label || '-';
        return `<tr><td>${score}</td><td>${probability}</td></tr>`;
      }).join('');
    };

    // Варианты: Как было (10+H2H) / 10 игр (без H2H) / 5 игр (5 игр + 5 H2H)
    // Как было: d.bt.top3 (смешанная модель)
    const bodyMixed = document.getElementById('topBTOldScoresBody') || document.getElementById('topBTScoresBody');
    let mixed = null;
    if (d && d.bt && Array.isArray(d.bt.top3) && d.bt.top3.length) mixed = d.bt.top3;
    else if (Array.isArray(d.btOldScoreProbs) && d.btOldScoreProbs.length) mixed = d.btOldScoreProbs;
    fillTop(mixed || [], bodyMixed);

    try {
      if (!window.BTMM) return;
      const nameA = d?.playerA?.name || 'A';
      const nameB = d?.playerB?.name || 'B';
      const parseDate = (s)=>{ if(!s||typeof s!=='string') return null; const mm=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/); if(mm){ let dd=+mm[1],mo=+mm[2]-1,yy=+mm[3]; if(yy<100) yy+=2000; const dt=new Date(yy,mo,dd); if(!isNaN(dt.getTime())) return dt; } return null; };
      const toPairsFromRecents = (matches, playerName, limit=10) => {
        const arr = [];
        for (const m of (matches||[])){
          const fo = m.finalScoreOwnOpponent;
          if (!fo || typeof fo.own !== 'number' || typeof fo.opponent !== 'number') continue;
          const dte = parseDate(m.date) || new Date(0);
          const opp = m.opponent || 'Opponent';
          if (fo.own > fo.opponent) arr.push({date:dte, w:playerName, l:opp}); else arr.push({date:dte, w:opp, l:playerName});
        }
        arr.sort((a,b)=> (b.date?.getTime?.()||0) - (a.date?.getTime?.()||0));
        return arr.slice(0, limit).map(x=>[x.w,x.l]);
      };
      const toPairsFromH2H = (h2hGames, limit=10) => {
        const arr = [];
        const a = d?.playerA?.name || 'A';
        const b = d?.playerB?.name || 'B';
        for (const g of (h2hGames||[])){
          const date = (g && g.date instanceof Date) ? g.date : new Date(0);
          const aWon = !!g.win; // win from A perspective
          if (aWon) arr.push({date, w:a, l:b}); else arr.push({date, w:b, l:a});
        }
        arr.sort((x,y)=> (y.date?.getTime?.()||0)-(x.date?.getTime?.()||0));
        return arr.slice(0, limit).map(x=>[x.w,x.l]);
      };

      // 10 игр (без H2H)
      const body10 = document.getElementById('topBT10Body');
      if (body10) {
        const pairsA = toPairsFromRecents(d?.recentsA10 || [], nameA, 10);
        const pairsB = toPairsFromRecents(d?.recentsB10 || [], nameB, 10);
        const resNo = window.BTMM.computeTop3Scores(nameA, nameB, pairsA, pairsB, [], { l2: 1e-3 });
        const listNo = (resNo.top3 || []).map(x=>({score:x.score, probability:x.probability}));
        fillTop(listNo, body10);
      }

      // 5 игр (5 игр + 5 H2H)
      const body5m = document.getElementById('topBT5MixBody');
      if (body5m) {
        const pairsA5 = toPairsFromRecents(d?.recentsA10 || [], nameA, 5);
        const pairsB5 = toPairsFromRecents(d?.recentsB10 || [], nameB, 5);
        let h2hPairs5 = [];
        const games = Array.isArray(d?.h2h?.h2hGames) ? d.h2h.h2hGames : [];
        if (games.length) {
          h2hPairs5 = toPairsFromH2H(games, 5);
        } else if (Array.isArray(d?.h2hOrientedA) && d.h2hOrientedA.length) {
          const arr = (d.h2hOrientedA || []).slice(0,5);
          h2hPairs5 = arr.map(m => {
            const own = m?.finalScoreOwnOpponent?.own || 0;
            const opp = m?.finalScoreOwnOpponent?.opponent || 0;
            return (own > opp) ? [nameA, nameB] : [nameB, nameA];
          });
        }
        const res5m = window.BTMM.computeTop3Scores(nameA, nameB, pairsA5, pairsB5, h2hPairs5, { l2: 1e-3 });
        const list5m = (res5m.top3 || []).map(x=>({score:x.score, probability:x.probability}));
        fillTop(list5m, body5m);
      }
    } catch(_){}
  }

  // Минималистичный прогноз (Winner + хинты)
  function fillMinimalForecast(d) {
    try {
      const titleEl = document.getElementById('mfTitle');
      const hintsEl = document.getElementById('mfHints');
      if (!titleEl) return;

      const clamp01 = (x)=> Math.max(0, Math.min(1, Number(x)||0));
      const clamp = (v, lo, hi)=> Math.max(lo, Math.min(hi, v));
      const sigmoid = (x)=> 1/(1+Math.exp(-x));
      const logit = (p)=> Math.log(p/(1-p));

      // Determine favorite by non-BT if available; fallback to BT, then model
      const nbA = (typeof d?.playerA?.nonBTProbability10 === 'number') ? d.playerA.nonBTProbability10/100
                 : (typeof d?.playerA?.nonBTProbability === 'number') ? d.playerA.nonBTProbability/100 : null;
      const nbB = (typeof d?.playerB?.nonBTProbability10 === 'number') ? d.playerB.nonBTProbability10/100
                 : (typeof d?.playerB?.nonBTProbability === 'number') ? d.playerB.nonBTProbability/100 : null;
      let favSide = null; // 'A' or 'B'
      if (nbA != null && nbB != null) favSide = (nbA >= nbB) ? 'A' : 'B';
      else if (typeof d?.bt_p_match === 'number') favSide = (d.bt_p_match >= 0.5) ? 'A' : 'B';
      else if (typeof d?.forecast?.pA === 'number') favSide = (d.forecast.pA >= 0.5) ? 'A' : 'B';
      else favSide = 'A';

      const fav = (favSide === 'A') ? d.playerA : d.playerB;
      const dog = (favSide === 'A') ? d.playerB : d.playerA;

      // Inputs
      const P_nonBT = clamp01((favSide==='A'? nbA : nbB) ?? (typeof d?.forecast?.pA === 'number' ? (favSide==='A'? d.forecast.pA : 1-d.forecast.pA) : 0.5));

      // Map strength (0..100) -> [-1..+1]
      const toSstar = (v)=> {
        const x = Number(v);
        if (!isFinite(x)) return 0;
        return clamp((x - 50)/50, -1, 1);
      };
      const S_star_fav = toSstar(fav?.effStrength ?? fav?.mainStrength);
      const S_star_dog = toSstar(dog?.effStrength ?? dog?.mainStrength);
      const S_gap = clamp(S_star_fav - S_star_dog, -1, 1);

      // H2H_smooth from feature dSh if available (already ~[-1..+1])
      const H2H_smooth = (typeof d?.forecast?.dSh === 'number') ? clamp(d.forecast.dSh, -1, 1) : 0;

      // Stability (%): from stability in [0..1]
      const STAB_fav = Math.round(100 * (Number(fav?.stability)||0));
      const STAB_dog = Math.round(100 * (Number(dog?.stability)||0));
      const STAB_gap = clamp((STAB_fav - STAB_dog)/20, -1, 1);

      // EXT (0..100) computed from patterns (same helper as patterns table)
      const getRate = (obj, {preferLoss=false}={}) => {
        const c01 = (x)=> Math.max(0, Math.min(1, Number(x)||0));
        if (!obj) return 0.5;
        if (typeof obj.rate === 'number') return c01(obj.rate);
        const total = Number(obj.total||0);
        if (total<=0) return 0.5;
        const wins = Number(preferLoss ? obj.losses||0 : obj.wins||0);
        return c01(wins/Math.max(1,total));
      };
      const computeEXT = (pats) => {
        const C1 = 1 - getRate(pats?.loss_after_2_1_obj, {preferLoss:true});
        const C2 = 1 - getRate(pats?.loss_after_two_set_run, {preferLoss:true});
        const C3 = 1 - getRate(pats?.tiebreak_losses, {preferLoss:true});
        const C4 = getRate(pats?.decisive_fifth_wins ?? pats?.win_at_2_2);
        const ext = (0.30*C1 + 0.30*C2 + 0.20*C3 + 0.20*C4) * 100;
        return Math.round(ext);
      };
      const EXT_fav = computeEXT(fav?.patterns || {});
      const EXT_dog = computeEXT(dog?.patterns || {});

      // TopScoreDist for favorite (use BT dist if available). If fav is B, swap keys 3:2 <-> 2:3
      let p32 = null, p23 = null;
      try {
        const dist = d?.bt?.dist || null;
        if (dist && typeof dist === 'object') {
          if (favSide === 'A') {
            p32 = Number(dist['3:2']); p23 = Number(dist['2:3']);
          } else {
            p32 = Number(dist['2:3']); p23 = Number(dist['3:2']);
          }
        }
      } catch(_) {}
      if (!isFinite(p32)) p32 = 0; if (!isFinite(p23)) p23 = 0;

      // 1) Base mixture
      const w1=0.50, w2=0.25, w3=0.15, w4=0.10;
      const logit_base = w1*logit(clamp01(P_nonBT)) + w2*S_gap + w3*H2H_smooth + w4*STAB_gap;
      const P_base = clamp01(sigmoid(logit_base));

      // 2) Upset-Radar (guard)
      const calcUpsetRadar = () => {
        let u = 0;
        // монета vs высокая уверенность
        if (P_nonBT <= 0.60 && P_base >= 0.80) u += 1;
        // преимущество B по EXT
        if ((EXT_dog - EXT_fav) >= 15) u += 1;
        // преимущество B по STAB
        if ((STAB_dog - STAB_fav) >= 10) u += 1;
        // высокая доля 5‑сетных исходов
        if (((p32||0)+(p23||0)) >= 0.20) u += 1;
        return u;
      };
      let conflict = calcUpsetRadar();
      let P_guard = P_base;
      if (conflict === 1) P_guard = P_base - 0.05;
      if (conflict >= 2) P_guard = P_base - 0.10;
      if (conflict >= 3) P_guard = P_base - 0.15;
      // Cap after Upset-Radar to avoid overconfidence per spec
      if (conflict >= 2) P_guard = Math.min(P_guard, 0.80);

      // Anti-overfit by recent sweep streaks (3:0/0:3 in a row) — reduce ML confidence
      const sweepStreak = (arr) => {
        let s = 0;
        const L = Array.isArray(arr)? arr.slice(0,5) : [];
        for (let i=0;i<L.length;i++){
          const fo = L[i]?.finalScoreOwnOpponent;
          if (!fo || isNaN(Number(fo.own)) || isNaN(Number(fo.opponent))) break;
          const a = Number(fo.own), b = Number(fo.opponent);
          if ((a===3 && b===0) || (a===0 && b===3)) s++; else break;
        }
        return s;
      };
      try {
        const streakA = sweepStreak(d.recentsA10);
        const streakB = sweepStreak(d.recentsB10);
        const pen = 0.05 * Math.max(streakA, streakB);
        if (pen > 0) P_guard = Math.max(0.50, P_guard - pen);
      } catch(_) {}
      P_guard = clamp(P_guard, 0.50, 0.95);

      // 1️⃣ Anti-overheat favorite rule
      let hvFlag = false;
      const tops5 = (p32||0)+(p23||0);
      if (P_guard > 0.85 && EXT_fav > 75 && EXT_dog > 60 && tops5 >= 0.15) {
        P_guard = clamp(Math.max(0.50, P_guard - 0.20), 0.50, 0.80);
        hvFlag = true;
      }

      // 3) Calibration (placeholder: identity; hook for iso lookup by conflict)
      const applyIso = (p, band)=> p; // TODO: plug isotonic tables when available
      const P_final = clamp01(applyIso(P_guard, conflict>=1?1:0));

      // TB3.5 conservative model (per spec)
      const smooth = (p, n, prior, k) => {
        const pp = Number(p); const nn = Math.max(0, Number(n)||0); const kk = Math.max(0, Number(k)||0); const pr = Number(prior);
        return ((isFinite(pp)?pp:0)*nn + (isFinite(pr)?pr:0)*kk) / Math.max(1, nn + kk);
      };
      const calcTBFeatures = () => {
        // ext_mean, stab_min, s_gap, coin, tops_5set
        const ext_mean = (clamp(EXT_fav,0,100) + clamp(EXT_dog,0,100)) / 200; // 0..1
        const stab_min = Math.min(clamp(STAB_fav,0,100), clamp(STAB_dog,0,100)) / 100; // 0..1
        const s_gap = clamp(S_gap, -1, 1);
        const coin = clamp(1 - 2*Math.abs(clamp01(P_nonBT) - 0.5), 0, 1);
        const tops_5set = clamp01((isFinite(p32)?p32:0) + (isFinite(p23)?p23:0));

        // tb_rate_pair over both players' recent sets
        const getSets = (m)=> Array.isArray(m?.setsOwnOpponent)? m.setsOwnOpponent : [];
        const recA = Array.isArray(d.recentsA10)? d.recentsA10 : [];
        const recB = Array.isArray(d.recentsB10)? d.recentsB10 : [];
        let tbSets = 0, totSets = 0;
        const countSets = (arr) => {
          for (const m of arr) {
            const sets = getSets(m);
            for (const [a,b] of sets) {
              const aa=Number(a)||0, bb=Number(b)||0; if (aa>=10 && bb>=10) tbSets++; totSets++;
            }
          }
        };
        countSets(recA); countSets(recB);
        const tbRatePair_raw = (totSets>0? (tbSets/totSets) : 0);
        const n_tbPair = totSets;

        // p35_hist: fraction of matches with >=4 sets across recents (both) + H2H (dedup by url)
        const h2hA = Array.isArray(d.h2hOrientedA)? d.h2hOrientedA : [];
        const h2hB = Array.isArray(d.h2hOrientedB)? d.h2hOrientedB : [];
        const seen = new Set();
        let longCnt=0, mCnt=0;
        const visitMatches = (arr) => {
          for (const m of arr) {
            const k = m?.url || JSON.stringify(m.finalScoreOwnOpponent||{});
            if (seen.has(k)) continue; seen.add(k);
            const sets = getSets(m);
            if (sets.length>0) { mCnt++; if (sets.length>=4) longCnt++; }
          }
        };
        visitMatches(recA); visitMatches(recB); visitMatches(h2hA); visitMatches(h2hB);
        const p35_hist_raw = (mCnt>0? (longCnt/mCnt) : 0);
        const n_hist = mCnt;

        // recent_sweep per player (3:0 or 0:3)
        const sweepFreq = (arr) => {
          let sweeps=0, total=0;
          for (const m of arr) {
            const fs = m?.finalScoreOwnOpponent; if (!fs) continue;
            const a = Number(fs.own)||0, b = Number(fs.opponent)||0;
            if ((a===3 && b===0) || (a===0 && b===3)) sweeps++;
            total++;
          }
          return { p: (total>0? (sweeps/total) : 0), n: total };
        };
        const swA = sweepFreq(recA); const swB = sweepFreq(recB);
        const freq30_A_raw = swA.p, n30_A = swA.n;
        const freq30_B_raw = swB.p, n30_B = swB.n;

        return {
          ext_mean, stab_min, s_gap, coin, tops_5set,
          tbRatePair_raw, n_tbPair,
          p35_hist_raw, n_hist,
          freq30_A_raw, n30_A, freq30_B_raw, n30_B
        };
      };

      const feat = calcTBFeatures();
      // Apply smoothing
      const tb_rate_pair = smooth(feat.tbRatePair_raw, feat.n_tbPair, 0.40, 20);
      const p35_hist     = smooth(feat.p35_hist_raw, feat.n_hist, 0.60, 30);
      const freq30_A     = smooth(feat.freq30_A_raw, feat.n30_A, 0.18, 15);
      const freq30_B     = smooth(feat.freq30_B_raw, feat.n30_B, 0.18, 15);
      const recent_sweep = Math.max(freq30_A, freq30_B);

      // 🔧 Мини-промт: расчёт P_TB (≥4 сетов) без перегрева
      const EXT_A = clamp(EXT_fav,0,100); const EXT_B = clamp(EXT_dog,0,100);
      const EXTmean = (EXT_A + EXT_B) / 2;         // 0..100
      const EXTgap  = Math.abs(EXT_A - EXT_B);     // 0..100
      const STABmin = Math.min(clamp(STAB_fav,0,100), clamp(STAB_dog,0,100));
      const Sgap    = Math.abs(clamp(S_gap,-1,1)); // 0..1
      // DryTop from BT top score distribution
      let DryTop = 0; try { const dist = d?.bt?.dist||{}; DryTop = (Number(dist['3:0'])||0) + (Number(dist['0:3'])||0); } catch(_) {}
      // TieRate from smoothed pair TB rate
      const TieRate = clamp01(tb_rate_pair);
      // RecentSweep: 1 if any player has 3:0/0:3 in last 2 matches
      const hasRecentSweep = (arr) => {
        const L = Array.isArray(arr)? arr.slice(0,2) : [];
        for (const m of L) { const fo = m?.finalScoreOwnOpponent; const a=Number(fo?.own)||0, b=Number(fo?.opponent)||0; if ((a===3&&b===0)||(a===0&&b===3)) return 1; }
        return 0;
      };
      const RecentSweep = Math.max(hasRecentSweep(d.recentsA10), hasRecentSweep(d.recentsB10));

      // Base logistic with modest weights
      const z = -0.5
        + 0.35 * ((EXTmean - 70) / 30)
        + 0.25 * ((STABmin - 75) / 15)
        + 0.15 * TieRate
        - 0.50 * Sgap
        - 0.40 * (EXTgap / 30)
        - 0.60 * DryTop
        - 0.30 * RecentSweep;
      let P_TB = clamp01(sigmoid(z));

      // Hard caps (anti-95%) applied sequentially
      if (STABmin < 70)                P_TB = Math.min(P_TB, 0.82);
      if (EXT_A >= 85 && EXT_B <= 65)  P_TB = Math.min(P_TB, 0.78);
      if (Sgap >= 0.35)                P_TB = Math.min(P_TB, 0.75);
      if (DryTop >= 0.25)              P_TB = Math.min(P_TB, 0.72);
      if (RecentSweep === 1)           P_TB = Math.min(P_TB, 0.70);
      P_TB = clamp(P_TB, 0.45, 0.88);

      // --- NO BET flags per spec ---
      const noBetML = (clamp01(P_nonBT) >= 0.47 && clamp01(P_nonBT) <= 0.53) || (EXT_fav >= 80 && EXT_dog >= 80);
      // For TB NO BET: use |S_gap| and strong 3:0/0:3 mass from BT dist
      let p30 = 0, p03 = 0; try { const dist = d?.bt?.dist||{}; p30 = Number(dist['3:0'])||0; p03 = Number(dist['0:3'])||0; } catch(_) {}
      const noBetTB = (Math.abs(feat.s_gap) >= 0.35) && ((p30 + p03) >= 0.30);

      // Optional market-aware filter and Kelly cap placeholder
      let market = null, value = null, kellyEff = null, noBetMarket = false;
      try {
        market = (favSide==='A') ? (Number(d?.market?.pWinnerA)) : (Number(d?.market?.pWinnerB));
        if (!isNaN(market) && market>0 && market<1){
          value = P_final - market;
          // crude confidence proxy from conflicts (lower when more conflicts)
          const conf = Math.max(0.5, Math.min(0.95, 0.85 - 0.1*Math.max(0, conflict-1)));
          if (value < 0.04 || conf < 0.65) noBetMarket = true;
          // Kelly placeholder (requires odds), cap at 0.25 and zero if value too small
          const odds = Number(d?.market?.oddsFav);
          if (!isNaN(odds) && odds>1) {
            const b = odds - 1; const p = P_final; const q = 1-p;
            let k = (b*p - q) / b; if (!isFinite(k)) k = 0;
            kellyEff = Math.max(0, Math.min(0.25, k));
            if (value < 0.04) kellyEff = 0;
          }
        }
      } catch(_) {}

      // --- New favorite selection (explainable, robust) ---
      const H2H_raw = (typeof d?.forecast?.dSh === 'number') ? clamp(d.forecast.dSh, -1, 1) : 0; // -1..+1
      const mapH2H = (x)=> Math.max(-0.3, Math.min(0.3, 0.2 * x)); // scale to ~[-0.2..0.2]
      const P_nonbt_A = nbA!=null? nbA : (typeof d?.forecast?.pA === 'number'? d.forecast.pA : 0.5);
      const P_nonbt_B = nbB!=null? nbB : (typeof d?.forecast?.pA === 'number'? (1-d.forecast.pA) : 0.5);
      const favSide0 = (P_nonbt_A >= P_nonbt_B) ? 'A' : 'B';
      const Sstar_A = toSstar(d?.playerA?.effStrength ?? d?.playerA?.mainStrength);
      const Sstar_B = toSstar(d?.playerB?.effStrength ?? d?.playerB?.mainStrength);
      const Sfav0 = (favSide0==='A'? Sstar_A : Sstar_B);
      const Sdog0 = (favSide0==='A'? Sstar_B : Sstar_A);
      const g_nonbt = ((favSide0==='A'? P_nonbt_A : P_nonbt_B) - 0.5) * 2; // ~[-1..+1]
      const g_s     = clamp(Sfav0 - Sdog0, -1, 1);
      const g_h2h   = (favSide0==='A' ? mapH2H(H2H_raw) : -mapH2H(H2H_raw));
      const Z_base  = 0.50*g_nonbt + 0.35*g_s + 0.15*g_h2h;
      let  P_base_fav = sigmoid(1.75 * Z_base);

      // Variance markers
      const is_coin  = (clamp01((favSide0==='A'? P_nonbt_A : P_nonbt_B)) >= 0.47 && clamp01((favSide0==='A'? P_nonbt_A : P_nonbt_B)) <= 0.53);
      const EXT_A_fav = clamp(EXT_fav,0,100); const EXT_B_fav = clamp(EXT_dog,0,100); // use oriented EXT from earlier
      const EXTmeanFav = (EXT_A_fav + EXT_B_fav) / 2; const EXTgapFav = Math.abs(EXT_A_fav - EXT_B_fav);
      const STABminFav = Math.min(STAB_fav, STAB_dog);
      const SgapAbs = Math.abs(Sstar_A - Sstar_B);
      const dryTop = (function(){ let v=0; try{ const dist=d?.bt?.dist||{}; v=(Number(dist['3:0'])||0)+(Number(dist['0:3'])||0);}catch(_){} return clamp01(v);} )();
      const recentSweep = (function(){ const has=(arr)=>{ const L=(arr||[]).slice(0,2); for(const m of L){ const fo=m?.finalScoreOwnOpponent; const a=Number(fo?.own)||0,b=Number(fo?.opponent)||0; if((a===3&&b===0)||(a===0&&b===3)) return true;} return false;}; return (has(d.recentsA10)||has(d.recentsB10))?1:0; })();

      // Conflict score per spec
      let conflictFav = 0;
      if (is_coin) conflictFav++;
      if (EXTmeanFav>=80 && STABminFav<75) conflictFav++;
      if (EXTgapFav>=18 && STABminFav<=78) conflictFav++;
      if (Math.abs(((favSide0==='A'? P_nonbt_A : P_nonbt_B)) - 0.5) <= 0.06 && Math.sign(g_s) !== Math.sign(g_nonbt)) conflictFav++;
      if (dryTop >= 0.28 && SgapAbs >= 0.35) conflictFav++;

      // No favorite rules
      const noFavByRules = (
        (is_coin && Math.abs(g_s) <= 0.15 && Math.abs(g_h2h) <= 0.05) ||
        (conflictFav >= 2) ||
        (SgapAbs <= 0.10 && EXTmeanFav >= 82 && dryTop <= 0.18)
      );

      // Shrink and caps
      let shrink = 1.0;
      shrink *= (1 - 0.12 * (EXTgapFav / 30));
      shrink *= (1 - 0.10 * Math.max(0, 0.75 - STABminFav/100));
      shrink *= (1 - 0.10 * dryTop);
      if (recentSweep) shrink *= 0.92;
      let P_fav = 0.50 + (P_base_fav - 0.50) * Math.max(0, shrink);
      if (EXTmeanFav >= 80 && is_coin) P_fav = Math.min(P_fav, 0.70);
      if (conflictFav === 1)        P_fav = Math.min(P_fav, 0.78);
      P_fav = clamp(P_fav, 0.54, 0.88);

      // --- Compact MINIMAL BLOCK rendering per spec ---
      // Winner with H2H contribution and dispersion guard
      const w10=0.55, w5=0.30, w3n=0.15;
      const pA10_no = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability10) : (100 - (d?.playerA?.nonBTProbability10||0))) / 100);
      const pA5_no  = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability5)  : (100 - (d?.playerA?.nonBTProbability5||0)))  / 100);
      const pA3_no  = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability3)  : (100 - (d?.playerA?.nonBTProbability3||0)))  / 100);
      const pA10_w  = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability10_h2h) : (100 - (d?.playerA?.nonBTProbability10_h2h||0))) / 100 || pA10_no);
      const pA5_w   = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability5_h2h)  : (100 - (d?.playerA?.nonBTProbability5_h2h||0)))  / 100 || pA5_no);
      const pA3_w   = clamp01((favSide0==='A'? (d?.playerA?.nonBTProbability3_h2h)  : (100 - (d?.playerA?.nonBTProbability3_h2h||0)))  / 100 || pA3_no);
      const L = (p)=> Math.log(Math.max(1e-6, Math.min(1-1e-6, p))/Math.max(1e-6, 1-Math.min(1-1e-6, p)));
      const logit_base_nb = w10*L(pA10_no) + w5*L(pA5_no) + w3n*L(pA3_no);
      let dH2H = w10*(L(pA10_w)-L(pA10_no)) + w5*(L(pA5_w)-L(pA5_no)) + w3n*(L(pA3_w)-L(pA3_no));
      dH2H = Math.max(-0.22, Math.min(0.22, dH2H));
      const logit_ml = logit_base_nb + 0.6*dH2H;
      const P_ml_raw = 1/(1+Math.exp(-logit_ml));
      // UpsetRadar per spec for minimal block
      const EXTavg = Math.round((EXT_A_fav + EXT_B_fav)/2);
      let UpsetRadar2 = (
        (pA10_no>=0.47 && pA10_no<=0.53 ? 1:0)
        + ((Math.min(STABminFav,100)>=78 && EXT_A_fav>=80 && EXT_B_fav>=80) ? 1:0)
        + (((p32||0)+(p23||0)) >= 0.33 ? 1:0)
        + ((SgapAbs<=0.18 && tb_rate_pair>=0.28) ? 1:0)
      );
      let P_ml = (UpsetRadar2>=2) ? (0.5 + 0.75*(P_ml_raw-0.5)) : P_ml_raw;
      // --- Letdown/Fatigue and H2H streak penalties ---
      const PD10_A = Number(d?.playerA?.pointsSummary10?.diff)||0;
      const PD10_B = Number(d?.playerB?.pointsSummary10?.diff)||0;
      const PD5_A  = Number(d?.playerA?.pointsSummary5?.diff)||0;
      const PD5_B  = Number(d?.playerB?.pointsSummary5?.diff)||0;
      const PD10_Fav = (favSide0==='A'? PD10_A : PD10_B);
      const PD10_Dog = (favSide0==='A'? PD10_B : PD10_A);
      const PD5_Fav  = (favSide0==='A'? PD5_A  : PD5_B );
      // H2H last k losses for favorite
      const h2hFavArr = (favSide0==='A'? (d?.h2hOrientedA||[]) : (d?.h2hOrientedB||[]));
      const lastLoss = (k)=>{
        let cnt=0; for(let i=0;i<Math.min(k,h2hFavArr.length);i++){ const fo=h2hFavArr[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) cnt++; }
        return cnt===k;
      };
      const lost2 = lastLoss(2);
      const lost3 = lastLoss(3);
      // add to radar
      if (PD10_Fav>=25) UpsetRadar2 += 1;
      if (lost2) UpsetRadar2 += 1;
      // compute penalties
      const clamp01v = (x,lo,hi)=> Math.max(lo, Math.min(hi, x));
      let pen_pd = 0;
      if (PD10_Fav>=25){ pen_pd += 0.003*(PD10_Fav-25); if (PD5_Fav>=15) pen_pd += 0.02; if (PD10_Dog>0) pen_pd *= 0.8; }
      pen_pd = clamp01v(pen_pd, 0, 0.10);
      let pen_h2h = 0; if (lost2) pen_h2h = 0.07; if (lost3) pen_h2h = 0.12; if (PD10_Fav>=25 && (lost2||lost3)) pen_h2h += 0.03;
      let pen_total = pen_pd + pen_h2h; pen_total = clamp01v(pen_total, 0, 0.18);
      P_ml = clamp01v(P_ml - pen_total, 0.05, 0.95);
      P_ml = Math.max(0.18, Math.min(0.82, P_ml));

      // TB3.5 per minimal spec
      const a0=-2.4;
      const z_tb = a0
        + 0.038 * ((EXT_A_fav + EXT_B_fav)/2)
        + 0.022 * Math.min(STAB_fav, STAB_dog)
        + 0.60 * tb_rate_pair
        + 0.48 * (function(){
            // fraction of 4-5 sets across both players recent
            const frac = (arr)=>{ let m=0,l=0; for(const mth of (arr||[])){ const s=Array.isArray(mth.setsOwnOpponent)? mth.setsOwnOpponent:[]; if(s.length){ m++; if(s.length>=4) l++; } } return m? l/m : 0; };
            return (frac(d.recentsA10)+frac(d.recentsB10))/2;
          })()
        - 0.95 * SgapAbs
        - 0.55 * (function(){ let dry=0,t=0; const c=(arr)=>{ for(const m of (arr||[])){ const fo=m.finalScoreOwnOpponent; if(fo){ const a=+fo.own||0,b=+fo.opponent||0; if((a===3&&b===0)||(a===0&&b===3)) dry++; t++; } } }; c(d.recentsA10); c(d.recentsB10); return t? dry/t : 0; })()
        - 0.40 * Math.abs(EXT_A_fav - EXT_B_fav)
        + 0.55 * ((pA10_no>=0.47 && pA10_no<=0.53)?1:0)
        - 0.50 * (function(){ const has=(arr)=>{ const L=(arr||[]).slice(0,2); for(const m of L){ const fo=m?.finalScoreOwnOpponent; const a=+fo?.own||0,b=+fo?.opponent||0; if((a===3&&b===0)||(a===0&&b===3)) return 1;} return 0;}; return Math.max(has(d.recentsA10), has(d.recentsB10)); })()
        - 0.80 * (function(){ let tot=0,sk=0; const c=(arr)=>{ for(const m of (arr||[])){ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; for(const [a,b] of s){ const aa=+a||0,bb=+b||0; sk += (aa-bb); tot++; } } }; c(d.recentsA10); c(d.recentsB10); return tot? (sk/Math.max(1,tot)) : 0; })();
      let P_tb_raw = 1/(1+Math.exp(-z_tb));
      const dryTopPair = (function(){ let p30=+((d?.bt?.dist||{})['3:0']||0), p03=+((d?.bt?.dist||{})['0:3']||0); return p30+p03; })();
      if (SgapAbs>=0.35 || dryTopPair>=0.30) P_tb_raw = Math.min(P_tb_raw, 0.70);
      let P_tb = (UpsetRadar2>=2) ? Math.max(P_tb_raw, 0.62) : P_tb_raw;
      P_tb = Math.max(0.35, Math.min(0.88, P_tb));

      // Coupling
      const corr = Math.max(0, Math.min(0.22, 0.22*(0.5 - Math.abs(P_ml - 0.5))));
      const P_ml_final = Math.max(0.01, Math.min(0.99, P_ml * (1 - corr)));
      const P_tb_final = Math.max(0.01, Math.min(0.99, P_tb + corr * (1 - P_tb)));

      // Render minimal one-line, no tips/emoji/badges
      const favRenderName = (favSide0==='A'? (d?.playerA?.name||'Игрок 1') : (d?.playerB?.name||'Игрок 2'));
      if (!isFinite(P_ml_final) || !isFinite(P_tb_final)) {
        // skip render if invalid
      } else {
        const Pml_pct = Math.min(90, Math.round(P_ml_final * 100));
        // Заголовок: Имя — FCI (используем калиброванную вероятность как fallback FCI)
        titleEl.textContent = `${favRenderName} — FCI: ${Pml_pct}%`;
        // ---- Improved favorite block (compact 3-line info) ----
        try {
          // P_base from Non-BT mixture (no H2H), already computed via logit_base_nb
          const P_base_prob = 1/(1+Math.exp(-logit_base_nb));
          const P_base_pct = Math.round(P_base_prob * 1000)/10; // one decimal
          const P_committee_pct = Math.round(P_ml_final * 1000)/10;
          const conflict_pp = Math.abs(P_committee_pct - P_base_pct);
          let risk = 'низкий', emoji='🟢';
          if (P_committee_pct >= 80 && conflict_pp >= 15) { risk='риск повышен'; emoji='🔴'; }
          else if (P_committee_pct >= 75 && conflict_pp >= 10) { risk='умеренный риск'; emoji='🟡'; }
          else if (P_committee_pct <= 60 && P_committee_pct >= 50) { risk='неопределённость'; emoji='⚪️'; }
          else if (P_committee_pct < 50) { risk='аутсайдер'; emoji='⚫️'; }
          // Убираем старый двухстрочный блок
          const favImp = document.getElementById('favImproved');
          if (favImp) { favImp.textContent = ''; }

          // --- Inline FCI right above favImproved + replace header with Name + FCI ---
          try {
            const anchor = document.getElementById('favImproved');
            if (anchor) {
              // Components for FCI v3.0 (consensus-focused)
              const to01 = (x)=> (typeof x==='number' && isFinite(x) ? Math.max(0,Math.min(1,x)) : null);
              const pct01 = (x)=> (typeof x==='number' && isFinite(x) ? Math.max(0,Math.min(1,x/100)) : null);
              function fciWindow(list){
                const xs = (list||[]).filter(v=>v!=null && isFinite(v));
                if (!xs.length) return null;
                const m = xs.reduce((a,b)=>a+b,0)/xs.length;
                const v = xs.reduce((s,x)=>s+(x-m)*(x-m),0)/xs.length;
                const std = Math.sqrt(Math.max(0,v));
                const sign = m - 0.5;
                const agree = 1 - Math.min(std/0.25, 1);
                return Math.max(0, Math.min(1, agree * (0.5 + 2*Math.abs(sign))));
              }
              // Gather windows (favor-oriented)
              const models3 = [];
              const nb3 = pct01(fav.p3); if (nb3!=null) models3.push(nb3);
              const log3 = to01(favMl3); if (log3!=null) models3.push(log3);
              const models5 = []; const nb5 = pct01(fav.p5); if (nb5!=null) models5.push(nb5);
              const models10 = []; const nb10 = pct01(fav.p10); if (nb10!=null) models10.push(nb10);
              const f3 = fciWindow(models3);
              const f5 = fciWindow(models5);
              const f10 = fciWindow(models10);
              let FCI = 0; if (f3!=null) FCI += 0.6*f3; if (f5!=null) FCI += 0.3*f5; if (f10!=null) FCI += 0.1*f10;
              const stability = favIsA ? to01(d?.playerA?.stability) : to01(d?.playerB?.stability);
              if (stability!=null) {
                const oppStab = favIsA ? to01(d?.playerB?.stability) : to01(d?.playerA?.stability);
                if (oppStab!=null) {
                  if (stability>0.85 && oppStab>0.85 && Math.abs(stability-oppStab)<0.10) FCI += 0.05;
                  else if (Math.min(stability, oppStab) < 0.70) FCI -= 0.05;
                }
              }
              FCI = Math.max(0, Math.min(1, FCI));
              const val = (typeof FCI==='number') ? (FCI*100).toFixed(1)+'%' : '—';
              if (!document.getElementById('tsx-fci-inline')) {
                const node = document.createElement('div');
                node.id = 'tsx-fci-inline';
                node.className = 'cmp-row fci';
                node.setAttribute('style', 'display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;margin:6px 0;');
                node.textContent = `FCI: ${val}`;
                anchor.parentNode.insertBefore(node, anchor);
              } else {
                try { document.getElementById('tsx-fci-inline').textContent = `FCI: ${val}`; } catch(_) {}
              }

              // Replace header and favImproved block contents at the end of the tick
              setTimeout(() => {
                try {
                  const titleEl = document.getElementById('mfTitle');
                  if (titleEl) titleEl.textContent = `${favRenderName} — FCI: ${val}`;
                  const favImp2 = document.getElementById('favImproved');
                  if (favImp2) favImp2.textContent = '';
                } catch(_) {}
              }, 0);
            }
          } catch(_) {}

          // --- Hybrid Markov (by points) inline row under FCI ---
          try {
            const hmId = 'tsx-hm-inline';
            const host = document.getElementById('favImproved') || document.getElementById('mfCompare');
            if (host && !document.getElementById(hmId)) {
              const MS_DAY = 24*60*60*1000;
              const countLast2Days = (arr)=>{ try{ const now=new Date().getTime(); const cutoff=now-2*MS_DAY; let c=0; (arr||[]).forEach(m=>{ const dStr=m?.date||''; const mm=(String(dStr).match(/(\d{1,2})[.\/-](\d{1,2})/)||[]); if(mm.length){ const dd=+mm[1], mo=+mm[2]-1; const dt=new Date(new Date().getFullYear(),mo,dd); if(!isNaN(dt.getTime()) && dt.getTime()>=cutoff) c++; } }); return c; }catch(_){ return 0; } };
              const pickWin = (arr)=> (countLast2Days(arr)>=5? (arr||[]).slice(0,3) : (arr||[]).slice(0,5));
              const diffs = (arr)=>{ const out=[]; (arr||[]).forEach(m=>{ const sets=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; sets.forEach(([a,b])=>{ const aa=+a||0,bb=+b||0; out.push(aa-bb); }); }); return out; };
              const pSet = (arr)=>{ const ds=diffs(arr); if(!ds.length) return 0.5; const ps=ds.map(d=>1/(1+Math.exp(-d/7))); return ps.reduce((s,v)=>s+v,0)/ps.length; };
              const favRec = favIsA ? recA10 : recB10;
              const oppRec = favIsA ? recB10 : recA10;
              const p1=pSet(pickWin(favRec)), p2=pSet(pickWin(oppRec));
              const p = (p1+p2)>0 ? (p1/(p1+p2)) : 0.5; const q=1-p;
              const P30=p**3, P31=3*p**3*q, P32=6*p**3*q**2, P03=q**3, P13=3*q**3*p, P23=6*q**3*p**2;
              const Pwin=P30+P31+P32, Plose=P03+P13+P23; const P2=Pwin+P23; const top=['3:1', '3:2', '3:0'][[P31,P32,P30].indexOf(Math.max(P31,P32,P30))];
              const line=document.createElement('div');
              line.id=hmId; line.className='cmp-row hm';
              line.setAttribute('style','display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #f1f1f1;background:#fcfcfc;margin:6px 0;');
              line.textContent = `Марков (очки): ${(Math.round((Pwin/(Pwin+Plose))*100))}% • Топ-счёт: ${top} • ≥2 сетов: ${Math.round(P2*100)}%`;
              host.parentNode.insertBefore(line, host);
            }
          } catch(_) {}
        } catch(_) {}
      }
      const tbLine = document.getElementById('mfTB');
      const sigLine = document.getElementById('mfSIG');
      const warnLine = document.getElementById('mfWarn');
      const subLine = document.getElementById('mfSub');
      if (tbLine) tbLine.style.display = 'none';
      if (sigLine) sigLine.style.display = 'none';
      if (warnLine) warnLine.style.display = 'none';
      if (subLine) subLine.style.display = 'none';
      // Render small Fav vs Outsider compare under minimal forecast
      try {
        const host = document.getElementById('mfCompare');
        if (host) {
          const nameA = d?.playerA?.name || 'Игрок 1';
          const nameB = d?.playerB?.name || 'Игрок 2';
          const nbA3 = Number(d?.playerA?.nonBTProbability3);
          const nbB3 = Number(d?.playerB?.nonBTProbability3);
          const nbA3h = Number(d?.playerA?.nonBTProbability3_h2h);
          const nbB3h = Number(d?.playerB?.nonBTProbability3_h2h);
          // Compute logistic(3) like model block
          const toPct1 = (v)=> (typeof v==='number' && isFinite(v) ? (Math.round(v*10)/10).toFixed(1)+'%' : '—');
          const toPctInt = (v)=> (typeof v==='number' && isFinite(v) ? Math.round(v)+'%' : '—');
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
          const computeForWindow = (recA, recB, nLabel=3) => {
            const A = recA, B = recB;
            const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
            const A_per = perMatchSetDiff(A), B_per = perMatchSetDiff(B);
            const F_short_A = emaArr(A_per.slice(0,5), 0.7);
            const F_short_B = emaArr(B_per.slice(0,5), 0.7);
            const Trend_A = slope3(A_per); const Trend_B = slope3(B_per);
            const NF = 6; let dF = ((F_short_A - F_short_B) + 0.5*(Trend_A - Trend_B)) / NF; dF = clamp(dF, -1, 1);
            const NS = 0.5; let dS = (isFinite(SstarA)&&isFinite(SstarB))? ((SstarA - SstarB)/NS) : 0; dS = clamp(dS, -1, 1);
            const A10 = setsAvgDiffPerSet(recA10), B10 = setsAvgDiffPerSet(recB10);
            const A5  = setsAvgDiffPerSet(recA10.slice(0,5)),  B5  = setsAvgDiffPerSet(recB10.slice(0,5));
            let baseD = 0.6*((A5-B5)) + 0.4*((A10-B10));
            const favA3 = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0);
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
            const pA = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0) ? pFav : (1-pFav);
            const pB = 1 - pA;
            return { pA, pB };
          };
          const out3 = computeForWindow(recA10.slice(0,3), recB10.slice(0,3), 3);
          const mlA3 = (typeof out3?.pA === 'number') ? (out3.pA*100) : undefined;
          const mlB3 = (typeof out3?.pB === 'number') ? (out3.pB*100) : undefined;
          const favLbl = 'фаворит'; const dogLbl = 'аутсайдер';
          const favHdr = `${favLbl} (${favName})`;
          const dogHdr = `${dogLbl} (${dogName})`;
          const nbLine = (x,y)=> [isFinite(x)? `без H2H ${Math.round(x)}%` : null, isFinite(y)? `с H2H ${Math.round(y)}%` : null].filter(Boolean).join(' • ');
          // Orient by favSide0 computed above in this function
          const favSide0 = (function(){
            const nbA10 = (typeof d?.playerA?.nonBTProbability10 === 'number') ? d.playerA.nonBTProbability10/100
                         : (typeof d?.playerA?.nonBTProbability === 'number') ? d.playerA.nonBTProbability/100 : null;
            const nbB10 = (typeof d?.playerB?.nonBTProbability10 === 'number') ? d.playerB.nonBTProbability10/100
                         : (typeof d?.playerB?.nonBTProbability === 'number') ? d.playerB.nonBTProbability/100 : null;
            if (nbA10 != null && nbB10 != null) return (nbA10 >= nbB10) ? 'A' : 'B';
            return 'A';
          })();
          const favName = (favSide0==='A'? nameA : nameB);
          const dogName = (favSide0==='A'? nameB : nameA);
          const nbFavNo = (favSide0==='A'? nbA3 : nbB3);
          const nbFavWith = (favSide0==='A'? nbA3h : nbB3h);
          const nbDogNo = (favSide0==='A'? nbB3 : nbA3);
          const nbDogWith = (favSide0==='A'? nbB3h : nbA3h);
          const mlFav3 = (favSide0==='A'? mlA3 : mlB3);
          const mlDog3 = (favSide0==='A'? mlB3 : mlA3);
          const idxFav3 = nbFavNo;
          const idxDog3 = nbDogNo;
          const html = `
            <div class="min2-compare" style="background:#fff;color:#222;border:1px solid #e6e6e6;border-radius:10px;overflow:hidden;font:500 13px/1.4 system-ui;">
              <div class="cmp-head" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #eee;background:#f7f7f7;">
                <div style="padding:8px 10px;font-weight:600;">${favHdr}</div>
                <div style="padding:8px 10px;font-weight:600;border-left:1px solid #eee;">${dogHdr}</div>
              </div>
              <div class="cmp-row nb3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #f1f1f1;">
                <div class="fav nb3" style="padding:8px 10px;">${nbLine(nbFavNo, nbFavWith)}</div>
                <div class="opp nb3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${nbLine(nbDogNo, nbDogWith)}</div>
              </div>
              <div class="cmp-row ml3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #f1f1f1;">
                <div class="fav ml3" style="padding:8px 10px;">${toPct1(mlFav3)}</div>
                <div class="opp ml3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${toPct1(mlDog3)}</div>
              </div>
              <div class="cmp-row idx3" style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
                <div class="fav idx3" style="padding:8px 10px;">${toPctInt(idxFav3)}</div>
                <div class="opp idx3" style="padding:8px 10px;border-left:1px solid #f1f1f1;">${toPctInt(idxDog3)}</div>
              </div>
            </div>`;
          host.innerHTML = html;
        }
      } catch(_) {}
// Optionally expose object for debugging/other UI
      // Build lightweight tags for quick diagnostics (avoid ReferenceError if undefined)
      const tags = (() => {
        const t = [];
        try {
          if ((conflict>=2) || (conflictFav>=2)) t.push('high_conflict');
          if (hvFlag) t.push('high_variance');
          if (noBetML) t.push('no_bet_ml');
          if (noBetTB) t.push('no_bet_tb');
          if (noBetMarket) t.push('no_bet_market');
        } catch(_) {}
        return t;
      })();
      d.minimal = {
        winner: {
          name: favRenderName,
          prob: (!noFavByRules? P_fav : 0.53),
          hints: { long_match: (P_TB>=0.80), high_variance: (conflict>=2) || (conflictFav>=2) || noFavByRules, hv_fav: hvFlag },
          noBet: { ml: !!noBetML || !!noBetMarket || hvFlag || noFavByRules, tb35: !!noBetTB },
          market: (market!=null? { p: market, value } : null),
          kellyEff,
          tags
        }
      };
    } catch(e) { console.warn('fillMinimalForecast error', e); }
  }

  // === Индекс согласия (Consensus) ===
  function fillConsensus(d) {
    try {
      const hasConsensus = (typeof Consensus !== 'undefined' && typeof Consensus.computeConsensus === 'function');

      const blk = document.getElementById('consensusBlock');
      const badge = document.getElementById('consBadge');
      const gradeDescEl = document.getElementById('consGradeDesc');
      const probEl = document.getElementById('consProb');
      const probHintEl = document.getElementById('consProbHint');
      if (!blk || !badge || !probEl) return;

      // Inputs from data
      const strengthA = parseFloat(d.playerA?.mainStrength ?? d.playerA?.strength ?? 0) || 0;
      const strengthB = parseFloat(d.playerB?.mainStrength ?? d.playerB?.strength ?? 0) || 0;
      const stabilityA = parseFloat(d.playerA?.stability ?? 0) || 0; // 0..1 or 0..100
      const stabilityB = parseFloat(d.playerB?.stability ?? 0) || 0;
      const gamesTodayA = Number(d.playerA?.matchesToday?.total || 0);
      const gamesTodayB = Number(d.playerB?.matchesToday?.total || 0);

      // Clamp BT to avoid infinite logits and overconfidence
      const clipProb = (p)=>{ if (typeof p !== 'number' || isNaN(p)) return 0.5; return Math.max(0.18, Math.min(0.82, p)); };
      const pBT_A = clipProb((typeof d.bt_p_match === 'number') ? d.bt_p_match : 0.5);

      // H2H sets summary + set3 (base)
      let h2h_sets_A = 0, h2h_sets_B = 0, h2h_set3_A = 0, h2h_set3_B = 0, h2hTotalSets = 0, h2hTotalSet3 = 0;
      try {
        const det = d?.h2h?.setWins?.detailed;
        if (det?.summary) {
          h2hTotalSets = Number(det.summary.totalSets || 0);
          h2h_sets_A = Number(det.summary.playerAWins || 0);
          h2h_sets_B = Number(det.summary.playerBWins || 0);
        }
        if (det?.playerA?.set3 && det?.playerB?.set3) {
          h2h_set3_A = Number(det.playerA.set3.win || 0);
          h2h_set3_B = Number(det.playerB.set3.win || 0);
          h2hTotalSet3 = Number((det.playerA.set3.total || 0) + (det.playerB.set3.total || 0));
        }
      } catch (_) {}

      // Tie-break losses
      const tbAobj = d?.playerA?.patterns?.tiebreak_losses;
      const tbBobj = d?.playerB?.patterns?.tiebreak_losses;
      const tb_lose_A = (tbAobj && typeof tbAobj.rate === 'number') ? tbAobj.rate : null;
      const tb_lose_B = (tbBobj && typeof tbBobj.rate === 'number') ? tbBobj.rate : null;
      const tb_total_A = (tbAobj && typeof tbAobj.total === 'number') ? tbAobj.total : 0;
      const tb_total_B = (tbBobj && typeof tbBobj.total === 'number') ? tbBobj.total : 0;

      // Prob. of 5th set
      const p5_base = (typeof d?.decider?.p5_no_h2h === 'number') ? d.decider.p5_no_h2h
                      : (typeof d?.decider?.empP5 === 'number') ? d.decider.empP5 : 0;
      const p5_h2h = (typeof d?.decider?.p5_with_h2h === 'number') ? d.decider.p5_with_h2h : null;

      // Rematch flag: any H2H within last 48 hours
      let rematch = 0;
      try {
        const games = d?.h2h?.h2hGames || [];
        if (games.length) {
          const now = Date.now();
          let latest = null;
          for (const g of games) {
            const t = (g && g.date instanceof Date) ? g.date.getTime() : (g && typeof g.date === 'string' ? Date.parse(g.date) : NaN);
            if (!isNaN(t)) latest = (latest == null || t > latest) ? t : latest;
          }
          if (latest != null) {
            const hours = Math.abs(now - latest) / 3600000;
            if (hours <= 48) rematch = 1;
          }
        }
      } catch (_) {}

      // Build consensus (with robust fallback)
      const buildInput = () => ({
        strengthA, strengthB,
        stabilityA, stabilityB,
        gamesTodayA, gamesTodayB,
        pBT_A,
        h2h_sets_A, h2h_sets_B,
        h2h_set3_A, h2h_set3_B,
        tb_lose_A: (typeof tb_lose_A === 'number' ? tb_lose_A : 0.5),
        tb_lose_B: (typeof tb_lose_B === 'number' ? tb_lose_B : 0.5),
        p5_base, p5_h2h,
        // Advantage in decisive 5th (pattern-based)
        p5_edge_rate_A: (function(){
          try {
            const r = d?.playerA?.patterns?.decisive_fifth_wins || d?.playerA?.patterns?.win_at_2_2;
            if (!r) return null; if (typeof r.rate === 'number') return r.rate; const t=r.total||0, w=r.wins||0; return t>0? (w/t): null;
          } catch(_) { return null; }
        })(),
        p5_edge_rate_B: (function(){
          try {
            const r = d?.playerB?.patterns?.decisive_fifth_wins || d?.playerB?.patterns?.win_at_2_2;
            if (!r) return null; if (typeof r.rate === 'number') return r.rate; const t=r.total||0, w=r.wins||0; return t>0? (w/t): null;
          } catch(_) { return null; }
        })(),
        rematch,
        samples: {
          tbA: tbAobj?.total || 0,
          tbB: tbBobj?.total || 0,
          h2hSets: h2hTotalSets || 0,
          h2hSet3: h2hTotalSet3 || 0
        }
      });

      // Fallback function
      const fallbackCompute = (inp) => {
        const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
        const clamp01 = (x) => clamp(x, 0, 1);
        const logit = (p) => { const pp = Math.max(1e-6, Math.min(1-1e-6, clamp01(p||0.5))); return Math.log(pp/(1-pp)); };
        const invLogit = (z) => 1/(1+Math.exp(-z));
        const eff = (S, stab, g) => {
          const s01 = stab>1?stab/100:stab; const fat=Math.max(0,1-0.04*Math.max(0,(g||0)-2));
          return clamp(S*(0.6+0.4*s01)*fat,0,100);
        };
        const EffA = eff(inp.strengthA, inp.stabilityA, inp.gamesTodayA);
        const EffB = eff(inp.strengthB, inp.stabilityB, inp.gamesTodayB);
        const eff_gap = clamp((EffA-EffB)/100,-1,1);
        const stabA = (inp.stabilityA>1?inp.stabilityA/100:inp.stabilityA)||0;
        const stabB = (inp.stabilityB>1?inp.stabilityB/100:inp.stabilityB)||0;
        const stab_gap = clamp(stabA-stabB,-1,1);
        const btZ = logit(inp.pBT_A||0.5);
        const setsA = inp.h2h_sets_A||0, setsB = inp.h2h_sets_B||0;
        const h2h_sets_gap = (setsA+setsB)>0 ? clamp((setsA-setsB)/(setsA+setsB),-1,1) : 0;
        const s3A = inp.h2h_set3_A||0, s3B = inp.h2h_set3_B||0;
        const set3_edge = (s3A+s3B)>0 ? clamp((s3A-s3B)/(s3A+s3B),-1,1) : 0;
        const tbA = clamp01(inp.tb_lose_A||0.5), tbB = clamp01(inp.tb_lose_B||0.5);
        const tb_edge = clamp(((1-tbA)-(1-tbB)),-1,1);
        const p5 = clamp01(inp.p5_base||0);
        const rem = inp.rematch?1:0;
        // Усилили вклад H2H по сетам и 3-го сета; добавили лёгкий вклад преимущества в 5-м сете
        const p5_edge_rate_A = (typeof inp.p5_edge_rate_A === 'number') ? inp.p5_edge_rate_A : 0.5;
        const p5_edge_rate_B = (typeof inp.p5_edge_rate_B === 'number') ? inp.p5_edge_rate_B : 0.5;
        const p5_adv = clamp((p5_edge_rate_A - p5_edge_rate_B), -1, 1);
        const z = (1.0*btZ) + (0.80*eff_gap) + (0.90*stab_gap) + (0.75*h2h_sets_gap)
                + (0.45*set3_edge*(1-p5)) + (0.35*tb_edge*p5) + (0.15*p5_adv*p5)
                - (0.25*Math.max(0,(inp.gamesTodayA-inp.gamesTodayB)||0))
                - (0.30*rem);
        const p = invLogit(z);
        const pStar = Math.max(p, 1-p);
        const grade = (pStar>=0.66 && rem===0) ? 'A' : pStar>=0.58 ? 'B' : pStar>=0.45 ? 'C' : 'D';
        return { p_consensus: p, grade, terms: { t_bt:btZ, t_strength:0.80*eff_gap, t_stab:0.90*stab_gap, t_h2h_sets:0.50*h2h_sets_gap, t_set3:0.35*set3_edge*(1-p5), t_tb:0.35*tb_edge*p5, t_load:-0.25*Math.max(0,(inp.gamesTodayA-inp.gamesTodayB)||0), t_rematch:-0.30*rem, t_tb5:0, t_stabFlag: (stab_gap<=-0.10?-0.35:0)} };
      };

      let result;
      const inputObj = buildInput();
      try {
        result = hasConsensus ? Consensus.computeConsensus(inputObj) : fallbackCompute(inputObj);
        if (!result || typeof result.p_consensus !== 'number' || !result.grade) {
          result = fallbackCompute(inputObj);
        }
      } catch (_e) {
        result = fallbackCompute(inputObj);
      }

      // Render
      blk.style.display = '';
      // Badge
      badge.textContent = result.grade || '—';
      badge.classList.remove('cons-A','cons-B','cons-C','cons-D');
      if (result.grade === 'A') badge.classList.add('cons-A');
      else if (result.grade === 'B') badge.classList.add('cons-B');
      else if (result.grade === 'C') badge.classList.add('cons-C');
      else if (result.grade === 'D') badge.classList.add('cons-D');
      if (gradeDescEl) {
        const gradeDesc = (
          result.grade === 'A' ? 'надёжно' :
          result.grade === 'B' ? 'умеренно' :
          result.grade === 'C' ? 'монета' :
          result.grade === 'D' ? 'противоречия' : '—'
        );
        gradeDescEl.textContent = gradeDesc;
      }
      // Probability: show favorite side and its chance
      const pA = result.p_consensus;
      const pB = 1 - pA;
      const isAFav = pA >= pB;
      const pFav = isAFav ? pA : pB;
      const favName = isAFav ? (d?.playerA?.name || 'Игрок A') : (d?.playerB?.name || 'Игрок B');
      probEl.textContent = (pFav * 100).toFixed(1) + '%';
      if (probHintEl) {
        probHintEl.textContent = `— шанс победы ${favName}`;
      }
      // removed split bar

      // Consistency + explainability (оставляем только объяснения)
      renderConsistencyAndExplain(d, result);

    } catch (e) {
      console.warn('Consensus compute failed:', e);
      const blk = document.getElementById('consensusBlock');
      const badge = document.getElementById('consBadge');
      const probEl = document.getElementById('consProb');
      const desc = document.getElementById('consGradeDesc');
      if (blk) blk.style.display = '';
      if (badge) badge.textContent = '—';
      if (probEl) probEl.textContent = '—';
      if (desc) desc.textContent = 'нет данных';
    }
  }

  // === Итоговый прогноз (агрегатор) ===
  function fillFinalForecast(d) {
    try {
      const favEl = document.getElementById('finalFav');
      const probEl = document.getElementById('finalProb');
      const confEl = document.getElementById('finalConf');
      if (!favEl || !probEl || !confEl) return;

      const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
      const clamp01 = (x)=>clamp(x,0,1);
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';

      // --- Inputs ---
      const p_logit = (typeof d?.forecast?.pA === 'number') ? d.forecast.pA : null;
      const S1 = Number(d?.playerA?.effStrength ?? d?.playerA?.mainStrength ?? d?.playerA?.strength) || 0;
      const S2 = Number(d?.playerB?.effStrength ?? d?.playerB?.mainStrength ?? d?.playerB?.strength) || 0;
      const hwA = Number(d?.h2h?.summary?.A?.wins||0), htA = Number(d?.h2h?.summary?.A?.total||0);
      const hwB = Number(d?.h2h?.summary?.B?.wins||0), htB = Number(d?.h2h?.summary?.B?.total||0);
      const St1 = (()=>{ const v=d?.playerA?.stability; if (typeof v!=='number') return 0.5; return v<=1? v : v/100; })();
      const St2 = (()=>{ const v=d?.playerB?.stability; if (typeof v!=='number') return 0.5; return v<=1? v : v/100; })();

      const getRate = (obj, preferLoss=false)=>{
        if (!obj) return null;
        if (typeof obj==='number') return clamp01(obj);
        const t = Number(obj.total||0); if (t<=0) return null;
        const w = Number(obj.wins||0); const l = Number(obj.losses||0);
        if (preferLoss) return clamp01(l/t);
        return clamp01(w/t);
      };
      const p_dec1 = getRate(d?.playerA?.patterns?.decisive_fifth_wins ?? d?.playerA?.patterns?.win_at_2_2);
      const p_dec2 = getRate(d?.playerB?.patterns?.decisive_fifth_wins ?? d?.playerB?.patterns?.win_at_2_2);
      const p_after12_1 = getRate(d?.playerA?.patterns?.win_after_1_2);
      const p_after12_2 = getRate(d?.playerB?.patterns?.win_after_1_2);
      const p_lead21_loss_1 = getRate(d?.playerA?.patterns?.loss_after_2_1_obj, true);
      const p_lead21_loss_2 = getRate(d?.playerB?.patterns?.loss_after_2_1_obj, true);

      // Compute F (EMA + trend) on the fly using series if available
      const ema = (vals, a=0.4)=>{ if(!vals.length) return 0; let s=vals[0]; for(let i=1;i<vals.length;i++) s=a*vals[i]+(1-a)*s; return s; };
      const slope = (vals)=>{ const n=vals.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=vals[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x;} const den=n*sxx-sx*sx; return den? (n*sxy-sx*sy)/den : 0; };
      const norm = (arr)=> (arr||[]).map(v=> clamp((Number(v)||0)/100, 0, 1)*2-1);
      const seriesA = norm(d?.playerA?.successSeries10 || []);
      const seriesB = norm(d?.playerB?.successSeries10 || []);
      const F1 = ema(seriesA, 0.4) + 0.3*slope(seriesA);
      const F2 = ema(seriesB, 0.4) + 0.3*slope(seriesB);

      // Derive components
      const alpha_eff = 0.10; // on normalized diff
      const p_eff = 1/(1+Math.exp(-(alpha_eff * ((S1-S2)/100))));
      const p_h2h = (hwA+hwB)>0 ? ((hwA+1)/(hwA+hwB+2)) : 0.5;

      // Dynamic weights in logit space
      const n_logit = 100; // proxy
      const n_eff = (Array.isArray(d?.recentsA10)?d.recentsA10.length:0) + (Array.isArray(d?.recentsB10)?d.recentsB10.length:0);
      const n_h2h = (htA||0) + (htB||0);
      const t_l = 0.5 * Math.sqrt(n_logit);
      const t_e = 0.3 * Math.sqrt(Math.max(1,n_eff));
      const t_h = 0.2 * Math.sqrt(Math.max(1,n_h2h));
      const tw = t_l + t_e + t_h;
      const wl = t_l/tw, we = t_e/tw, wh = t_h/tw;

      const logit = (p)=> Math.log(clamp01(p)/(1-clamp01(p)));
      const z_base = (p_logit!=null? wl*logit(p_logit) : 0) + we*logit(p_eff) + wh*logit(p_h2h);

      // Clutch adjustments
      const C1 = (0.5*(p_dec1??0.5)) + (0.35*(p_after12_1??0.5)) - (0.15*(p_lead21_loss_1??0.5));
      const C2 = (0.5*(p_dec2??0.5)) + (0.35*(p_after12_2??0.5)) - (0.15*(p_lead21_loss_2??0.5));
      const dF = F1 - F2; const dSt = St1 - St2; const dC = C1 - C2;
      let z = z_base + 0.35*dF + 0.25*dSt + 0.20*dC;

      // Consensus boost
      const sgn = z_base>=0? 1: -1;
      let agrees = 0, nsrc=0;
      (p_logit!=null? [p_logit,p_eff,p_h2h] : [p_eff,p_h2h]).forEach(p=>{ if (p!=null){ nsrc++; if (logit(p)*sgn>=0) agrees++; }});
      const agreeShare = nsrc? (agrees/nsrc) : 0.5;
      const gamma = 0.15;
      z = z * (1 + gamma*(2*agreeShare - 1));

      // Final prob with conservative shrink and clip
      let pAgg = 1/(1+Math.exp(-z));
      pAgg = 0.5 + 0.7*(pAgg-0.5);
      pAgg = clamp(pAgg, 0.18, 0.82);

      // Confidence
      let conf = 50 + Math.round(40*Math.abs(pAgg-0.5));
      const dA = Number(d?.playerA?.lastGameDays); const dB = Number(d?.playerB?.lastGameDays);
      if ((dA>7) || (dB>7)) conf -= 4;
      const gA = Number(d?.playerA?.matchesToday?.total||0); const gB = Number(d?.playerB?.matchesToday?.total||0);
      if (gA>=3 || gB>=3) conf -= 6; if (gA>=4 || gB>=4) conf -= 10;
      conf = clamp(conf, 5, 95);
      const emoji = conf>=70? '🟢' : conf>=50? '🟡' : '🔴';

      const favName = (pAgg>=0.5) ? nameA : nameB;
      const favProb = (pAgg>=0.5) ? pAgg : (1-pAgg);
      favEl.textContent = favName;
      probEl.textContent = (favProb*100).toFixed(1) + '%';
      confEl.textContent = `${emoji} ${conf}%`;
    } catch (e) {
      console.warn('final forecast error:', e);
    }
  }

  // === Логистическая модель на признаках (последние 10/5/3 + H2H) ===
  function fillModelForecast(d) {
    try {
      const blk = document.getElementById('modelBlock');
      if (!blk) return;
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';
      const nA = document.getElementById('modelNameA');
      const nB = document.getElementById('modelNameB');
      if (nA) nA.textContent = nameA; if (nB) nB.textContent = nameB;

      // Helpers
      const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
      const toPctStr = (p)=> (Math.round(p*1000)/10).toFixed(1)+'%';
      const recA10 = Array.isArray(d?.recentsA10)? d.recentsA10 : [];
      const recB10 = Array.isArray(d?.recentsB10)? d.recentsB10 : [];
      const setsAvgDiffPerSet = (rec)=>{
        let diff=0, sets=0; (rec||[]).forEach(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; s.forEach(([a,b])=>{ const aa=+a||0, bb=+b||0; diff += (aa-bb); sets++; }); });
        return sets? (diff/sets) : 0;
      };
      const perMatchSetDiff = (rec)=> (rec||[]).map(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; let diff=0; s.forEach(([a,b])=>{ diff += ((+a||0) - (+b||0)); }); return s.length? (diff/s.length) : 0; });
      const emaArr = (arr,a)=>{ if(!arr.length) return 0; let s=arr[0]; for(let i=1;i<arr.length;i++) s=a*arr[i]+(1-a)*s; return s; };
      const slope3 = (arr)=>{ const L=arr.slice(0,3); const n=L.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=L[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; } const den=n*sxx-sx*sx; return den? (n*sxy - sx*sy)/den : 0; };
      const pointsSummaryDiff = (rec)=>{ let sum=0; (rec||[]).forEach(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; s.forEach(([a,b])=>{ sum += ((+a||0) - (+b||0)); }); }); return sum; };

      // Pre-calc static parts
      const SstarA = Number(d?.playerA?.S_star); const SstarB = Number(d?.playerB?.S_star);
      const EXT_A = Number(d?.playerA?.patterns?  ( (1-(d.playerA.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerA.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerA.patterns.tiebreak_losses?.rate||0))*20 + (d.playerA.patterns.decisive_fifth_wins?.rate||d.playerA.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const EXT_B = Number(d?.playerB?.patterns?  ( (1-(d.playerB.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerB.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerB.patterns.tiebreak_losses?.rate||0))*20 + (d.playerB.patterns.decisive_fifth_wins?.rate||d.playerB.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const STAB_A = Number(d?.playerA?.stability||0)*100; const STAB_B = Number(d?.playerB?.stability||0)*100;

      const computeForWindow = (recA, recB, nLabel)=>{
        const A = recA, B = recB;
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

        const nbA10 = Number(d?.playerA?.nonBTProbability10)/100; const nbB10 = Number(d?.playerB?.nonBTProbability10)/100; const favA10 = (isFinite(nbA10)&&isFinite(nbB10)) ? (nbA10>=nbB10) : true;
        const favA5  = (Number(d?.playerA?.nonBTProbability5)||0) >= (Number(d?.playerB?.nonBTProbability5)||0);
        const favA3  = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0);
        const favA = (nLabel===10? favA10 : (nLabel===5? favA5 : favA3));

        const PD10_A = Number(d?.playerA?.stats?.pointsSummary10?.diff)||0;
        const PD5_A  = Number(d?.playerA?.pointsSummary5?.diff)||0;
        const PDk_A  = (nLabel===10? PD10_A : (nLabel===5? PD5_A : pointsSummaryDiff(A)));
        let blow = 0; if (favA){ if (PDk_A>=25) blow += (nLabel===10? 0.25 : (nLabel===5? 0.15 : 0.12)); if (nLabel!==3 && PD5_A>=15) blow += 0.15; }
        const hFav = favA? (d?.h2hOrientedA||[]) : (d?.h2hOrientedB||[]);
        const lostK = (k)=>{ let c=0; for(let i=0;i<Math.min(k,hFav.length);i++){ const fo=hFav[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) c++; } return c===k; };
        if (lostK(2)) blow += 0.20; if (lostK(3)) blow += 0.35;
        let dD = baseD - blow; const ND = 4; dD = clamp(dD/ND, -1, 1);

        const pairRates = (()=>{ let tb=0,sets=0,long=0,m=0; [A,B].forEach(arr=>{ arr.forEach(mm=>{ const s=Array.isArray(mm.setsOwnOpponent)? mm.setsOwnOpponent:[]; if(s.length){ m++; if(s.length>=4) long++; } s.forEach(([a,b])=>{ const aa=+a||0,bb=+b||0; if(aa>=10&&bb>=10) tb++; sets++; }); }); }); return { tb: (sets? tb/sets:0), long:(m? long/m:0) }; })();
        let ExtGap = (EXT_A - EXT_B)/100, StabTerm = (STAB_A - STAB_B)/100;
        let dT_raw = 0.6*ExtGap + 0.2*StabTerm + 0.2*(pairRates.tb - 0.5) + 0.2*(pairRates.long - 0.5);
        if (EXT_B - EXT_A >= 12 && favA) dT_raw -= 0.25;
        const NT = 0.7; let dT = clamp(dT_raw/NT, -1, 1);

        const bF=0.35, bS=0.30, bD=0.25, bT=0.15, b0=0.0;
        const z = b0 + bF*dF + bS*dS + bD*dD + bT*dT;
        let pFav = 1/(1+Math.exp(-z));
        const Pnb = (nLabel===10)? (isFinite(nbA10)&&isFinite(nbB10)? (favA? nbA10 : nbB10) : 0.5)
                   : (nLabel===5 ? ((Number(d?.playerA?.nonBTProbability5)||0)/100) : ((Number(d?.playerA?.nonBTProbability3)||0)/100));
        if (Pnb>=0.47 && Pnb<=0.53 && (EXT_A>=80 && EXT_B>=80)) pFav = 1/(1+Math.exp(-(z-0.35)));
        if (favA && (PDk_A||0) >= 25) pFav = Math.min(pFav, 0.77);
        if (lostK(2)) pFav = 1/(1+Math.exp(-(z-0.30)));
        if (lostK(3)) pFav = 1/(1+Math.exp(-(z-0.50)));

        const pA = favA? pFav : (1-pFav);
        const pB = 1 - pA;
        const orient = (x)=> favA? x : -x;
        return { pA, pB, favA, dF: orient(dF), dS: orient(dS), dD: orient(dD), dT: orient(dT) };
      };

      const out10 = computeForWindow(recA10, recB10, 10);
      const out5  = computeForWindow(recA10.slice(0,5), recB10.slice(0,5), 5);
      const out3  = computeForWindow(recA10.slice(0,3), recB10.slice(0,3), 3);

      blk.style.display = '';
      const p10A = document.getElementById('modelProb10A');
      const p10B = document.getElementById('modelProb10B');
      const p5A  = document.getElementById('modelProb5A');
      const p5B  = document.getElementById('modelProb5B');
      const p3A  = document.getElementById('modelProb3A');
      const p3B  = document.getElementById('modelProb3B');
      if (p10A) p10A.textContent = toPctStr(out10.pA);
      if (p10B) p10B.textContent = toPctStr(out10.pB);
      if (p5A)  p5A.textContent  = toPctStr(out5.pA);
      if (p5B)  p5B.textContent  = toPctStr(out5.pB);
      if (p3A)  p3A.textContent  = toPctStr(out3.pA);
      if (p3B)  p3B.textContent  = toPctStr(out3.pB);
      // Highlight green only for the leading side if > 54%
      if (p10A && p10B) {
        resetHL(p10A); resetHL(p10B);
        if (out10.pA >= out10.pB) { if (out10.pA > 0.54) applyTier(p10A,'good'); }
        else { if (out10.pB > 0.54) applyTier(p10B,'good'); }
      }
      if (p5A && p5B) {
        resetHL(p5A); resetHL(p5B);
        if (out5.pA >= out5.pB) { if (out5.pA > 0.54) applyTier(p5A,'good'); }
        else { if (out5.pB > 0.54) applyTier(p5B,'good'); }
      }
      if (p3A && p3B) {
        resetHL(p3A); resetHL(p3B);
        if (out3.pA >= out3.pB) { if (out3.pA > 0.54) applyTier(p3A,'good'); }
        else { if (out3.pB > 0.54) applyTier(p3B,'good'); }
      }

      const fmtDelta = (v)=>{ const x = Number(v)||0; return (x>=0?'+':'') + (Math.round(x*100)/100).toFixed(2); };
      const d10 = document.getElementById('modelDeltas10');
      const d5  = document.getElementById('modelDeltas5');
      const d3  = document.getElementById('modelDeltas3');
      if (d10) d10.textContent = [out10.dF, out10.dS, out10.dD, out10.dT].map(fmtDelta).join(' / ');
      if (d5)  d5.textContent  = [out5.dF,  out5.dS,  out5.dD,  out5.dT ].map(fmtDelta).join(' / ');
      if (d3)  d3.textContent  = [out3.dF,  out3.dS,  out3.dD,  out3.dT ].map(fmtDelta).join(' / ');
    } catch (e) { console.warn('fillModelForecast error', e); }
  }

  // === Красные флаги ===
  function fillRiskFlags(d) {
    try {
      if (typeof Consensus === 'undefined' || !Consensus.getRiskFlags) {
        console.warn('Risk flags module not available');
        const blk = document.getElementById('riskBlock');
        if (blk) blk.style.display = 'none';
        return;
      }
      const blk = document.getElementById('riskBlock');
      const badge = document.getElementById('riskBadge');
      const list = document.getElementById('riskList');
      const noBet = document.getElementById('riskNoBet');
      const under = document.getElementById('riskUnderMarkets');
      const suggestBox = document.getElementById('riskSuggest');
      const suggestList = document.getElementById('riskSuggestList');
      if (!blk || !badge || !list) return;

      // Prepare inputs (same as in fillConsensus)
      const strengthA = parseFloat(d.playerA?.mainStrength ?? d.playerA?.strength ?? 0) || 0;
      const strengthB = parseFloat(d.playerB?.mainStrength ?? d.playerB?.strength ?? 0) || 0;
      const stabilityA = parseFloat(d.playerA?.stability ?? 0) || 0;
      const stabilityB = parseFloat(d.playerB?.stability ?? 0) || 0;
      const gamesTodayA = Number(d.playerA?.matchesToday?.total || 0);
      const gamesTodayB = Number(d.playerB?.matchesToday?.total || 0);
      const pBT_A = (typeof d.bt_p_match === 'number') ? d.bt_p_match : 0.5;
      // H2H sets and set3
      let h2h_sets_A = 0, h2h_sets_B = 0, h2h_set3_A = 0, h2h_set3_B = 0;
      try {
        const det = d?.h2h?.setWins?.detailed;
        if (det?.summary) {
          h2h_sets_A = Number(det.summary.playerAWins || 0);
          h2h_sets_B = Number(det.summary.playerBWins || 0);
        }
        if (det?.playerA?.set3 && det?.playerB?.set3) {
          h2h_set3_A = Number(det.playerA.set3.win || 0);
          h2h_set3_B = Number(det.playerB.set3.win || 0);
        }
      } catch (_) {}
      // TB lose rate
      const tbAobj = d?.playerA?.patterns?.tiebreak_losses;
      const tbBobj = d?.playerB?.patterns?.tiebreak_losses;
      const tb_lose_A = (tbAobj && typeof tbAobj.rate === 'number') ? tbAobj.rate : null;
      const tb_lose_B = (tbBobj && typeof tbBobj.rate === 'number') ? tbBobj.rate : null;

      // 5th set probabilities
      const p5_base = (typeof d?.decider?.p5_no_h2h === 'number') ? d.decider.p5_no_h2h
                      : (typeof d?.decider?.empP5 === 'number') ? d.decider.empP5 : 0;
      const p5_h2h = (typeof d?.decider?.p5_with_h2h === 'number') ? d.decider.p5_with_h2h : null;

      // Rematch
      let rematch = 0;
      try {
        const games = d?.h2h?.h2hGames || [];
        if (games.length) {
          const now = Date.now();
          let latest = null;
          for (const g of games) {
            const t = (g && g.date instanceof Date) ? g.date.getTime() : (g && typeof g.date === 'string' ? Date.parse(g.date) : NaN);
            if (!isNaN(t)) latest = (latest == null || t > latest) ? t : latest;
          }
          if (latest != null) {
            const hours = Math.abs(now - latest) / 3600000;
            if (hours <= 48) rematch = 1;
          }
        }
      } catch (_) {}

      const rf = Consensus.getRiskFlags({
        strengthA, strengthB, stabilityA, stabilityB, gamesTodayA, gamesTodayB,
        pBT_A,
        h2h_sets_A, h2h_sets_B,
        h2h_set3_A, h2h_set3_B,
        tb_lose_A: (typeof tb_lose_A === 'number' ? tb_lose_A : 0.5),
        tb_lose_B: (typeof tb_lose_B === 'number' ? tb_lose_B : 0.5),
        p5_base, p5_h2h,
        rematch
      }, {locale: 'ru'});

      // Render
      blk.style.display = '';
      const count = rf.activeKeys.length;
      const riskPct = rf.riskScore;
      const riskLevel = riskPct >= 0.60 ? 'высокий' : (riskPct >= 0.40 ? 'средний' : 'низкий');
      badge.textContent = `Риск: ${riskLevel} (${count}/7)`;
      badge.classList.remove('risk-low','risk-mid','risk-high');
      if (riskPct >= 0.60) badge.classList.add('risk-high');
      else if (riskPct >= 0.40) badge.classList.add('risk-mid');
      else badge.classList.add('risk-low');

      // Actions by thresholds
      const noBetOn = rf.riskScore >= 0.40 || Consensus.shouldAvoidFavorite(rf);
      const underOn = rf.riskScore >= 0.60;
      if (noBet) noBet.style.display = noBetOn ? '' : 'none';
      if (under) under.style.display = underOn ? '' : 'none';

      // List flags
      list.innerHTML = '';
      rf.messages.forEach(msg => {
        const li = document.createElement('li');
        li.textContent = msg;
        list.appendChild(li);
      });

      // Suggest alternative markets (deterministic rules) — показываем только при NO BET
      const suggestions = [];
      const tbLossFav = rf.favoriteSide === 'A' ? (tbAobj?.rate ?? null) : (tbBobj?.rate ?? null);
      const det = d?.h2h?.setWins?.detailed;
      const a3 = det?.playerA?.set3?.win || 0;
      const b3 = det?.playerB?.set3?.win || 0;
      const set3Edge = (a3 + b3) > 0 ? (a3 - b3)/(a3 + b3) : 0;

      // 1) Высокий p5 + слабые TB у фаворита → ТБ по сетам / Будет 5-й: Да
      if ((p5_base >= 0.40) && (tbLossFav != null && tbLossFav >= 0.60)) {
        suggestions.push('ТБ по сетам / Будет 5-й сет: Да');
      }
      // 2) Сильный Set3_edge у андердога → фора по сетам +1.5 на андердога
      const set3EdgeFav = rf.favoriteSide === 'A' ? set3Edge : -set3Edge;
      if (set3EdgeFav < -0.20) {
        suggestions.push('Фора по сетам на андердога (+1.5)');
      }
      // (убрано по просьбе) тоталы при близкой EffS и рематч → не предлагать

      if (suggestBox && suggestList) {
        suggestList.innerHTML = '';
        if (suggestions.length && noBetOn) {
          suggestions.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s;
            suggestList.appendChild(li);
          });
          suggestBox.style.display = '';
        } else {
          suggestBox.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('Risk flags compute failed:', e);
      const blk = document.getElementById('riskBlock');
      if (blk) blk.style.display = 'none';
    }
  }

  function fillMainTable(data) {
    // Заполняем новую таблицу основных показателей
    const mainPlayerA = document.getElementById('mainPlayerA');
    const mainPlayerB = document.getElementById('mainPlayerB');
    const mainStrengthA = document.getElementById('mainStrengthA');
    const mainStrengthB = document.getElementById('mainStrengthB');
    const mainH2HA = document.getElementById('mainH2HA');
    const mainH2HB = document.getElementById('mainH2HB');
    const mainStabilityA = document.getElementById('mainStabilityA');
    const mainStabilityB = document.getElementById('mainStabilityB');

    if (mainPlayerA) mainPlayerA.textContent = data.playerA.name;
    if (mainPlayerB) mainPlayerB.textContent = data.playerB.name;
    if (mainStrengthA) mainStrengthA.textContent = String(Math.round(parseFloat(data.playerA.mainStrength ?? data.playerA.strength ?? 0)) || '-');
    if (mainStrengthB) mainStrengthB.textContent = String(Math.round(parseFloat(data.playerB.mainStrength ?? data.playerB.strength ?? 0)) || '-');
    if (mainH2HA) mainH2HA.textContent = data.playerA.h2h;
    if (mainH2HB) mainH2HB.textContent = data.playerB.h2h;
    // Эффективная сила: S * (0.6 + 0.4*stab) * (1 - 0.04*max(0, gamesToday-2))
    try {
      const effAEl = document.getElementById('effStrengthA');
      const effBEl = document.getElementById('effStrengthB');
      const effA = parseFloat(data.playerA?.effStrength);
      const effB = parseFloat(data.playerB?.effStrength);
      if (effAEl) effAEl.textContent = isNaN(effA) ? '-' : String(Math.round(effA));
      if (effBEl) effBEl.textContent = isNaN(effB) ? '-' : String(Math.round(effB));
    } catch(_) {}
    // Стабильность приходит как 0..1 — приведём к % и округлим
    const fmtStab = (val) => {
      if (typeof val !== 'number' || isNaN(val)) return '-';
      const v = (val <= 1 ? val * 100 : val);
      return `${Math.round(v)}%`;
    };
    if (mainStabilityA) mainStabilityA.textContent = fmtStab(data.playerA.stability);
    if (mainStabilityB) mainStabilityB.textContent = fmtStab(data.playerB.stability);

    // Убрали показатель "Вероятность" из основных — подсветки больше нет

    // Strength: symmetric tiers
    const strA = parseFloat(data.playerA.mainStrength ?? data.playerA.strength);
    const strB = parseFloat(data.playerB.mainStrength ?? data.playerB.strength);
    resetHL(mainStrengthA); resetHL(mainStrengthB);
    if (!isNaN(strA) && !isNaN(strB)) {
      const t = tierByDiff(strA - strB, {good: 15, warn: 8});
      if (t === 'good') { applyTier(mainStrengthA, 'good'); applyTier(mainStrengthB, 'bad'); }
      else if (t === 'bad') { applyTier(mainStrengthB, 'good'); applyTier(mainStrengthA, 'bad'); }
      else if (t === 'warn') { applyTier((strA>=strB?mainStrengthA:mainStrengthB), 'warn'); }
    }

    // Стабильность: разница >= 15 п.п.
    const rawStabA = parseFloat(data.playerA.stability);
    const rawStabB = parseFloat(data.playerB.stability);
    const stabA = isNaN(rawStabA) ? NaN : (rawStabA <= 1 ? rawStabA * 100 : rawStabA);
    const stabB = isNaN(rawStabB) ? NaN : (rawStabB <= 1 ? rawStabB * 100 : rawStabB);
    resetHL(mainStabilityA); resetHL(mainStabilityB);
    if (!isNaN(stabA) && !isNaN(stabB)) {
      const lowStabTh = 45;
      if (stabA < lowStabTh) applyTier(mainStabilityA, 'bad');
      if (stabB < lowStabTh) applyTier(mainStabilityB, 'bad');
      const tS = tierByDiff(stabA - stabB, {good: 20, warn: 10});
      if (tS === 'good') { applyTier(mainStabilityA, 'good'); applyTier(mainStabilityB, 'bad'); }
      else if (tS === 'bad') { applyTier(mainStabilityB, 'good'); applyTier(mainStabilityA, 'bad'); }
      else if (tS === 'warn') { applyTier((stabA>=stabB?mainStabilityA:mainStabilityB), 'warn'); }
    }

    // H2H: преимущество >= 3 побед
    resetHL(mainH2HA); resetHL(mainH2HB);
    try {
      const [hA, hB] = (data.playerA.h2h || '0-0').split('-').map(x => parseInt(x, 10));
      const d = (hA - hB);
      if (d >= 4) { applyTier(mainH2HA, 'good'); applyTier(mainH2HB, 'bad'); }
      else if (d <= -4) { applyTier(mainH2HB, 'good'); applyTier(mainH2HA, 'bad'); }
      else if (Math.abs(d) >= 2) { applyTier(d>=0?mainH2HA:mainH2HB, 'warn'); }
    } catch (_) {}
  }


  function fillStatsTables(data) {
    const statName1 = document.getElementById('statName1');
    if (statName1) statName1.textContent = data.playerA.name;
    
    const statName2 = document.getElementById('statName2');
    if (statName2) statName2.textContent = data.playerB.name;
    
    // Преобразуем S₂ и S₅ к новой шкале 0..100
    const formatStrength = (value) => {
      const num = parseFloat(value);
      if (isNaN(num)) return '-';
      return String(Math.round(num));
    };
    
    const s2Player1 = document.getElementById('s2Player1');
    if (s2Player1) s2Player1.textContent = formatStrength(data.playerA.s2);
    
    const s2Player2 = document.getElementById('s2Player2');
    if (s2Player2) s2Player2.textContent = formatStrength(data.playerB.s2);
    
    const s5Player1 = document.getElementById('s5Player1');
    if (s5Player1) s5Player1.textContent = formatStrength(data.playerA.s5);
    const s5Player2 = document.getElementById('s5Player2');
    if (s5Player2) s5Player2.textContent = formatStrength(data.playerB.s5);

    // Разница очков (5 матчей): суммарная разница и средняя за матч
    const fmtPts = (ps) => {
      if (!ps || typeof ps.diff !== 'number') return '—';
      const signTot = ps.diff > 0 ? '+' : '';
      const avg = (typeof ps.avgDiff === 'number') ? ps.avgDiff : (ps.matches>0 ? (ps.diff/ps.matches) : 0);
      const signAvg = avg > 0 ? '+' : '';
      return `${signTot}${Math.round(ps.diff)} (${signAvg}${avg.toFixed(2)})`;
    };
    const avgPtsDiffStat1 = document.getElementById('avgPtsDiffStat1');
    const avgPtsDiffStat2 = document.getElementById('avgPtsDiffStat2');
    if (avgPtsDiffStat1) avgPtsDiffStat1.textContent = fmtPts(data.playerA.pointsSummary5);
    if (avgPtsDiffStat2) avgPtsDiffStat2.textContent = fmtPts(data.playerB.pointsSummary5);
    // Bright red for strong negative (5 matches)
    try {
      const ps5A = data?.playerA?.pointsSummary5; const ps5B = data?.playerB?.pointsSummary5;
      const isDanger5 = (ps) => {
        if (!ps || typeof ps.diff !== 'number') return false;
        const avg = (typeof ps.avgDiff === 'number') ? ps.avgDiff : (ps.matches>0 ? (ps.diff/ps.matches) : 0);
        return (ps.diff <= -20) || (avg <= -4.0);
      };
      if (avgPtsDiffStat1 && isDanger5(ps5A)) avgPtsDiffStat1.classList.add('metric-danger');
      if (avgPtsDiffStat2 && isDanger5(ps5B)) avgPtsDiffStat2.classList.add('metric-danger');
    } catch(_) {}
    // Перегрев по очкам (5 матчей): индивидуальный даун-флаг при больших плюсовых значениях
    try {
      const pd5A = Number(data?.playerA?.pointsSummary5?.diff);
      const pd5B = Number(data?.playerB?.pointsSummary5?.diff);
      if (isFinite(pd5A) && pd5A > 15) { avgPtsDiffStat1?.classList.add('metric-bad'); }
      if (isFinite(pd5B) && pd5B > 15) { avgPtsDiffStat2?.classList.add('metric-bad'); }
    } catch(_) {}
    // 10 матчей
    const avgPtsDiff10Stat1 = document.getElementById('avgPtsDiff10Stat1');
    const avgPtsDiff10Stat2 = document.getElementById('avgPtsDiff10Stat2');
    const ps10A = data?.playerA?.stats?.pointsSummary10;
    const ps10B = data?.playerB?.stats?.pointsSummary10;
    if (avgPtsDiff10Stat1) avgPtsDiff10Stat1.textContent = fmtPts(ps10A);
    if (avgPtsDiff10Stat2) avgPtsDiff10Stat2.textContent = fmtPts(ps10B);
    // Bright red for strong negative (10 matches)
    try {
      const isDanger10 = (ps) => {
        if (!ps || typeof ps.diff !== 'number') return false;
        const avg = (typeof ps.avgDiff === 'number') ? ps.avgDiff : (ps.matches>0 ? (ps.diff/ps.matches) : 0);
        return (ps.diff <= -30) || (avg <= -3.0);
      };
      if (avgPtsDiff10Stat1 && isDanger10(ps10A)) avgPtsDiff10Stat1.classList.add('metric-danger');
      if (avgPtsDiff10Stat2 && isDanger10(ps10B)) avgPtsDiff10Stat2.classList.add('metric-danger');
    } catch(_) {}
    // Перегрев по очкам (10 матчей): индивидуальный даун-флаг при больших плюсовых значениях
    try {
      const pd10A = Number(ps10A?.diff);
      const pd10B = Number(ps10B?.diff);
      if (isFinite(pd10A) && pd10A > 25) { avgPtsDiff10Stat1?.classList.add('metric-bad'); }
      if (isFinite(pd10B) && pd10B > 25) { avgPtsDiff10Stat2?.classList.add('metric-bad'); }
    } catch(_) {}

    // Подсветка разницы очков в статистике (сумма за 5 матчей)
    const sumDiffA = data.playerA.pointsSummary5?.diff;
    const sumDiffB = data.playerB.pointsSummary5?.diff;
    if (typeof sumDiffA === 'number' && typeof sumDiffB === 'number') {
      const good = 15, warn = 8;
      if (sumDiffA - sumDiffB >= good) { avgPtsDiffStat1?.classList.add('metric-good'); avgPtsDiffStat2?.classList.add('metric-bad'); }
      else if (sumDiffB - sumDiffA >= good) { avgPtsDiffStat2?.classList.add('metric-good'); avgPtsDiffStat1?.classList.add('metric-bad'); }
      else if (Math.abs(sumDiffA - sumDiffB) >= warn) {
        (sumDiffA >= sumDiffB ? avgPtsDiffStat1 : avgPtsDiffStat2)?.classList.add('metric-highlight');
      }
    }
    // Подсветка разницы за 10 матчей — более мягкие пороги
    const sum10A = ps10A?.diff;
    const sum10B = ps10B?.diff;
    if (typeof sum10A === 'number' && typeof sum10B === 'number') {
      const good10 = 25, warn10 = 12;
      if (sum10A - sum10B >= good10) { avgPtsDiff10Stat1?.classList.add('metric-good'); avgPtsDiff10Stat2?.classList.add('metric-bad'); }
      else if (sum10B - sum10A >= good10) { avgPtsDiff10Stat2?.classList.add('metric-good'); avgPtsDiff10Stat1?.classList.add('metric-bad'); }
      else if (Math.abs(sum10A - sum10B) >= warn10) {
        (sum10A >= sum10B ? avgPtsDiff10Stat1 : avgPtsDiff10Stat2)?.classList.add('metric-highlight');
      }
    }

    // Универсальная подсветка различий (зелёный >=40%, жёлтый >=20%, красный — сильно ниже)
    (function() {
      const clearPair = (a, b) => {
        [a, b].forEach(el => {
          if (!el) return;
          el.classList.remove('metric-good','metric-highlight','metric-bad');
        });
      };
      const compareAndColor = (elA, elB, valA, valB, { scale = 'percent', higherBetter = true, green = 0.40, yellow = 0.20 } = {}) => {
        const a = parseFloat(valA); const b = parseFloat(valB);
        if (isNaN(a) || isNaN(b)) return;
        let x = a, y = b;
        if (!higherBetter) { x = -a; y = -b; }
        // Нормализуем к 0..1 для процентных метрик
        const norm = (v) => scale === 'percent' ? Math.max(0, Math.min(1, v / 100)) : v;
        const nx = norm(x), ny = norm(y);
        const betterIsA = nx >= ny;
        const maxv = Math.max(Math.abs(nx), Math.abs(ny), 1e-6);
        const diffRatio = Math.abs(nx - ny) / maxv; // симметричная относительная разница
        if (diffRatio >= green) {
          (betterIsA ? elA : elB)?.classList.add('metric-good');
          (betterIsA ? elB : elA)?.classList.add('metric-bad');
        } else if (diffRatio >= yellow) {
          (betterIsA ? elA : elB)?.classList.add('metric-highlight');
        }
      };

      // S2/S5 — больше = лучше
      clearPair(s2Player1, s2Player2);
      clearPair(s5Player1, s5Player2);
      compareAndColor(s2Player1, s2Player2, data.playerA.s2, data.playerB.s2, { scale: 'percent', higherBetter: true });
      compareAndColor(s5Player1, s5Player2, data.playerA.s5, data.playerB.s5, { scale: 'percent', higherBetter: true });
    })();

    // (строка Comeback ability удалена из блока статистики)

    // Стабильность (новая) удалена из интерфейса

    // (удалены строки «Сухие победы/поражения» из блока статистики)
    
    // Новые метрики - матчи сегодня с цветовой индикацией
    const matchesToday1 = document.getElementById('matchesToday1');
    if (matchesToday1) {
      const todayData = data.playerA.matchesToday;
      if (todayData && typeof todayData === 'object') {
        const winsText = todayData.wins > 0 ? `<span style="color: green; font-weight: bold;">${todayData.wins}</span>` : '';
        const lossesText = todayData.losses > 0 ? `<span style="color: red; font-weight: bold;">${todayData.losses}</span>` : '';
        const parts = [winsText, lossesText].filter(Boolean);
        matchesToday1.innerHTML = `${todayData.total} ${parts.length > 0 ? `(${parts.join('/')})` : ''}`;
      } else {
        matchesToday1.textContent = todayData || 0;
      }
    }
    
    const matchesToday2 = document.getElementById('matchesToday2');
    if (matchesToday2) {
      const todayData = data.playerB.matchesToday;
      if (todayData && typeof todayData === 'object') {
        const winsText = todayData.wins > 0 ? `<span style="color: green; font-weight: bold;">${todayData.wins}</span>` : '';
        const lossesText = todayData.losses > 0 ? `<span style="color: red; font-weight: bold;">${todayData.losses}</span>` : '';
        const parts = [winsText, lossesText].filter(Boolean);
        matchesToday2.innerHTML = `${todayData.total} ${parts.length > 0 ? `(${parts.join('/')})` : ''}`;
      } else {
        matchesToday2.textContent = todayData || 0;
      }
    }
    
    const formatScorePoints = (scorePoints) => {
      if (!scorePoints) return '-';
      const sign = scorePoints.totalPoints >= 0 ? '+' : '';
      return `${sign}${scorePoints.totalPoints} (${scorePoints.averagePoints})`;
    };
    
    const scorePoints1 = document.getElementById('scorePoints1');
    if (scorePoints1) scorePoints1.textContent = formatScorePoints(data.playerA.scorePoints);
    const scorePoints2 = document.getElementById('scorePoints2');
    if (scorePoints2) scorePoints2.textContent = formatScorePoints(data.playerB.scorePoints);

    // Доп. подсветка: матчи сегодня и очковые баллы (без изменения содержимого)
    // matchesToday1/2
    (function() {
      const el1 = document.getElementById('matchesToday1');
      const el2 = document.getElementById('matchesToday2');
      const t1 = data.playerA.matchesToday;
      const t2 = data.playerB.matchesToday;
      if (el1 && t1 && typeof t1 === 'object') {
        el1.classList.remove('metric-highlight');
        el1.classList.remove('metric-bad');
        if ((t1.total || 0) >= 3 || (t1.losses || 0) >= 2) el1.classList.add('metric-bad');
        else if ((t1.wins || 0) >= 2) el1.classList.add('metric-highlight');
      }
      if (el2 && t2 && typeof t2 === 'object') {
        el2.classList.remove('metric-highlight');
        el2.classList.remove('metric-bad');
        if ((t2.total || 0) >= 3 || (t2.losses || 0) >= 2) el2.classList.add('metric-bad');
        else if ((t2.wins || 0) >= 2) el2.classList.add('metric-highlight');
      }
    })();

    // Последняя игра: вывести количество дней с момента последнего матча и подсветить >3 дней красным
    (function() {
      const lastGame1 = document.getElementById('lastGame1');
      const lastGame2 = document.getElementById('lastGame2');
      const fmtDays = (n) => {
        if (n == null || isNaN(n)) return '-';
        const d = Math.max(0, parseInt(n, 10));
        const lastTwo = d % 100;
        const lastOne = d % 10;
        let word = 'дней';
        if (lastTwo < 11 || lastTwo > 14) {
          if (lastOne === 1) word = 'день';
          else if (lastOne >= 2 && lastOne <= 4) word = 'дня';
        }
        return `${d} ${word}`;
      };
      const dA = Number(data.playerA?.lastGameDays);
      const dB = Number(data.playerB?.lastGameDays);
      if (lastGame1) {
        lastGame1.textContent = fmtDays(dA);
        resetHL(lastGame1);
        if (!isNaN(dA) && dA > 3) applyTier(lastGame1, 'bad');
      }
      if (lastGame2) {
        lastGame2.textContent = fmtDays(dB);
        resetHL(lastGame2);
        if (!isNaN(dB) && dB > 3) applyTier(lastGame2, 'bad');
      }
    })();

    // Clutch Index (CI) — сводный показатель по паттернам
    (function(){
      const pct = (x)=> (x==null || isNaN(x) ? null : Math.max(0, Math.min(1, x)));
      const rateObj = (obj, preferLoss=false) => {
        if (!obj) return {rate:null, wins:null, total:0};
        if (typeof obj.rate === 'number') return {rate:pct(obj.rate), wins:obj.wins ?? null, total:obj.total ?? 0, losses: obj.losses ?? null};
        const total = Number(obj.total||0);
        if (total<=0) return {rate:null, wins:null, total:0, losses:null};
        const wins = Number(preferLoss? obj.losses||0 : obj.wins||0);
        const r = pct(wins/Math.max(1,total));
        return {rate:r, wins, total, losses: preferLoss? wins : (obj.losses ?? null)};
      };
      const buildCI = (pats) => {
        const p10 = rateObj(pats?.win_after_1_0, false);                   // Pwin_after_1set
        const pl21= rateObj(pats?.loss_after_2_1_obj, true);               // Plose_after_lead21 (loss rate)
        const p12 = rateObj(pats?.win_after_1_2, false);                   // Pwin_after_lose12
        const p2r = rateObj(pats?.win_two_set_run, false);                 // Pwin_series2sets
        const p22 = rateObj(pats?.decisive_fifth_wins || pats?.win_at_2_2, false); // Pwin_at_2_2
        const pl2 = rateObj(pats?.loss_after_two_set_run, true);           // Plose_series2sets
        const plt = rateObj(pats?.tiebreak_losses, true);                  // Plose_tiebreaks

        const v = (x, fb=0.5)=> (x==null? fb : x);
        const ci01 = (
          0.25 * v(p10.rate) +
          0.20 * (1 - v(pl21.rate)) +
          0.15 * v(p12.rate) +
          0.15 * v(p2r.rate) +
          0.10 * v(p22.rate) +
          0.05 * (1 - v(pl2.rate)) +
          0.10 * (1 - v(plt.rate))
        );
        const ciPct = Math.round(ci01 * 100);
        const br = (wins,total, invert=false) => {
          if (total==null || total<=0) return '—';
          if (!invert) return `${wins}/${total} (${Math.round((wins/Math.max(1,total))*100)}%)`;
          // invert: successes = total - losses
          const succ = Math.max(0, total - wins); // here wins holds losses if preferLoss=true
          return `${succ}/${total} (${Math.round((succ/Math.max(1,total))*100)}%)`;
        };
        const details = [
          `Победы после 1-го сета — ${br(p10.wins, p10.total)}`,
          `Не отдал при 2:1 — ${br(pl21.wins, pl21.total, true)}`,
          `Победы при 1:2 — ${br(p12.wins, p12.total)}`,
          `Победы при серии из 2 сетов — ${br(p2r.wins, p2r.total)}`,
          `Победы при 2:2 — ${br(p22.wins, p22.total)}`,
          `Не проиграл серию из 2 сетов — ${br(pl2.wins, pl2.total, true)}`,
          `Не проиграл тай-брейки — ${br(plt.wins, plt.total, true)}`
        ];
        return { ciPct, details };
      };

      const A = buildCI(data.playerA.patterns||{});
      const B = buildCI(data.playerB.patterns||{});
      const b1 = document.getElementById('ciBadge1');
      const b2 = document.getElementById('ciBadge2');
      const d1 = document.getElementById('ciDetails1');
      const d2 = document.getElementById('ciDetails2');
      const setBadge = (elBadge, elDetails, pct, details, cls) => {
        if (!elBadge || !elDetails) return;
        elBadge.className = `ci-badge ${cls}`;
        elBadge.textContent = (pct==null || isNaN(pct)) ? '—' : `${pct}%`;
        elDetails.innerHTML = (details||[]).map(x=>`• ${x}`).join('<br/>');
        elBadge.onclick = () => { elDetails.style.display = (elDetails.style.display==='none'||!elDetails.style.display)? 'block':'none'; };
      };
      // Relative highlight: higher CI → better (green), lower → worse (red)
      let clsA='ci-equal', clsB='ci-equal';
      if (isFinite(A.ciPct) && isFinite(B.ciPct)) {
        if (A.ciPct > B.ciPct) { clsA='ci-better'; clsB='ci-worse'; }
        else if (B.ciPct > A.ciPct) { clsA='ci-worse'; clsB='ci-better'; }
      }
      setBadge(b1, d1, A.ciPct, A.details, clsA);
      setBadge(b2, d2, B.ciPct, B.details, clsB);
    })();

    // scorePoints1/2 — подсветка по разнице totalPoints (только когда знаки разные)
    (function() {
      const sp1 = document.getElementById('scorePoints1');
      const sp2 = document.getElementById('scorePoints2');
      if (!sp1 || !sp2) return;
      const clear = (el) => el && el.classList.remove(
        'metric-highlight','metric-bad','metric-green-light','metric-green-strong','metric-danger'
      );
      clear(sp1); clear(sp2);

      const tp1 = parseInt(data.playerA?.scorePoints?.totalPoints, 10);
      const tp2 = parseInt(data.playerB?.scorePoints?.totalPoints, 10);
      if (isNaN(tp1) || isNaN(tp2)) return;

      const bothPositive = tp1 > 0 && tp2 > 0;
      const bothNegative = tp1 < 0 && tp2 < 0;
      const oppositeSign = (tp1 > 0 && tp2 < 0) || (tp1 < 0 && tp2 > 0);

      if (bothPositive || bothNegative) {
        // оба + или оба - — ярко красное, не рассматриваем
        sp1.classList.add('metric-danger');
        sp2.classList.add('metric-danger');
        return;
      }

      // Считаем разницу только когда знаки строго разные (+/-)
      if (!oppositeSign) return;
      const diff = Math.abs(tp1 - tp2);
      if (diff >= 10) {
        const p1IsBetter = tp1 > tp2; // положительный больше отрицательного
        const winEl = p1IsBetter ? sp1 : sp2;
        // 10..11.99 — светло-зеленый, >=12 — темно-зеленый
        if (diff >= 12) {
          winEl.classList.add('metric-green-strong');
        } else {
          winEl.classList.add('metric-green-light');
        }
      }
    })();
  }



  function fillVisualization(data) {
    // Фиксированный порядок строк: сверху Игрок 1 (playerA), снизу Игрок 2 (playerB)
    // Фаворит для визуализаций — по блоку «Вероятность (без BT)»
    const parseNum = (v) => {
      if (v == null) return null;
      const s = String(v).replace('%','');
      const n = (typeof v === 'number') ? v : parseFloat(s);
      return isNaN(n) ? null : n;
    };
    // Read raw values
    let aNon = parseNum(data.playerA?.nonBTProbability ?? data.playerA?.probability);
    let bNon = parseNum(data.playerB?.nonBTProbability ?? data.playerB?.probability);
    // Normalize to percents if needed (defensive: handle 0..1 input)
    if (aNon != null && bNon != null && aNon <= 1 && bNon <= 1) {
      aNon *= 100; bNon *= 100;
    }
    // Pick favorite only with a small margin to avoid fake ties
    const margin = 0.5; // percentage points
    let favName = null;
    if (aNon != null && bNon != null) {
      if (Math.abs(aNon - bNon) >= margin) {
        favName = (aNon > bNon) ? data.playerA.name : data.playerB.name;
      } else {
        favName = null; // effectively equal → no favorite highlight
      }
    } else {
      favName = data.favorite || data.bt_favorite || null;
    }

    const vizNameTop = document.getElementById('vizNameFav');
    const vizNameBottom = document.getElementById('vizNameUnd');
    if (vizNameTop) {
      vizNameTop.textContent = data.playerA.name;
      // Подсветим фаворита, но порядок не меняем
      resetHL(vizNameTop);
      if (favName && favName === data.playerA.name) vizNameTop.classList.add('favorite-value');
    }
    if (vizNameBottom) {
      vizNameBottom.textContent = data.playerB.name;
      resetHL(vizNameBottom);
      if (favName && favName === data.playerB.name) vizNameBottom.classList.add('favorite-value');
    }

    // Helper: convert emoji string (🟢/🔴) to circle elements (не используется сейчас)
    const renderCircles = (seq) => {
      if (!seq || typeof seq !== 'string') return '';
      const tokens = seq.replace(/\s+/g,'').split('');
      return tokens.map(ch => {
        const cls = (ch === '🟢') ? 'viz-win' : (ch === '🔴') ? 'viz-loss' : '';
        if (!cls) return '';
        return `<span class="viz-circle ${cls}"></span>`;
      }).join('');
    };

    // Визуализации: всегда A сверху, B снизу
    const matchVizTop = document.getElementById('matchVizFav');
    if (matchVizTop) matchVizTop.innerHTML = formatVisualization(data.playerA.visualization);

    const matchVizBottom = document.getElementById('matchVizUnd');
    if (matchVizBottom) matchVizBottom.innerHTML = formatVisualization(data.playerB.visualization);

    // H2H визуализация: компактно — фаворит (зелёный), аутсайдер (красный) с инициалами фамилий
    const h2hVizRow = document.getElementById('h2hVizRow');
    const h2hVizInline = document.getElementById('h2hVizInline');
    const h2hVizLabel = document.getElementById('h2hVizLabel');
    const h2hLegend = document.getElementById('h2hLegend');
    if (h2hVizRow && h2hVizInline && data.h2h && data.h2h.total > 0) {
      if (h2hVizLabel) h2hVizLabel.textContent = 'H2H:';
      // Визуализацию H2H показываем относительно фаворита (non-BT)

      let html = '';
      if (Array.isArray(data.h2h.h2hGames) && data.h2h.h2hGames.length) {
        const aName = data.playerA.name;
        const bName = data.playerB.name;
        html = data.h2h.h2hGames.map(g => {
          const aWon = !!g.win; // победа с точки зрения игрока A
          const aClass = aWon ? 'viz-win' : 'viz-loss';
          const bClass = aWon ? 'viz-loss' : 'viz-win';
          const aTitle = `${aName}: ${aWon ? 'победа' : 'поражение'}`;
          const bTitle = `${bName}: ${aWon ? 'поражение' : 'победа'}`;
          return `<span class="viz-pair"><span class="viz-circle ${aClass}" title="${aTitle}"></span><span class="viz-circle ${bClass}" title="${bTitle}"></span></span>`;
        }).join('');
      } else {
        // Фоллбэк: если нет структурированных игр, скрываем ряд
        h2hVizRow.style.display = 'none';
        html = '';
      }
      h2hVizRow.style.display = 'flex';
      const baseVis = (data.h2h && data.h2h.visualization ? data.h2h.visualization : '');
      const favIsA = favName === data.playerA.name;
      // Сервер даёт виз строку относительно игрока A. Если фаворит = B — инвертируем цвета.
      const visStr = favIsA ? baseVis : baseVis.replace(/🟢|🔴/g, m => (m === '🟢' ? '🔴' : '🟢'));
      h2hVizInline.innerHTML = formatVisualization(visStr);
      if (h2hLegend) {
        h2hLegend.style.display = '';
        const otherName = favIsA ? data.playerB.name : data.playerA.name;
        // 🟢 — победа фаворита, 🔴 — поражение фаворита
        h2hLegend.textContent = `🟢 ${favName || data.playerA.name} / 🔴 ${otherName}`;
      }
    } else if (h2hVizRow) {
      h2hVizRow.style.display = 'none';
      if (h2hLegend) h2hLegend.style.display = 'none';
    }
  }

  function countWonSets(setWins) {
    if (!setWins) return 0;
    return Object.values(setWins).reduce((sum, [wins]) => {
      const won = Number(wins.split('/')[0]) || 0;
      return sum + won;
    }, 0);
  }

  function countTotalSets(setWins) {
    if (!setWins) return 0;
    return Object.values(setWins).reduce((sum, [wins]) => {
      const total = Number((wins || "0/0").split('/')[1]) || 0;
      return sum + total;
    }, 0);
  }


  function fillSetsTable(data) {
    const p1Name = data.playerA.name || 'Игрок 1';
    const p2Name = data.playerB.name || 'Игрок 2';

    // Support both old (setWins/summary strings like "6/10") and new (sets.per[]) formats
    const getTotals = (player) => {
      // New structure
      if (player && player.sets && Array.isArray(player.sets.per)) {
        const totalWins = Number(player.sets.totalWins || 0);
        const totalSets = Number(player.sets.totalSets || 0);
        return { totalWins, totalSets };
      }
      // Old structure
      return {
        totalWins: countWonSets(player?.setWins),
        totalSets: countTotalSets(player?.setWins)
      };
    };
    const { totalWins: p1Won, totalSets: p1Total } = getTotals(data.playerA || {});
    const { totalWins: p2Won, totalSets: p2Total } = getTotals(data.playerB || {});

    const p1SetsEl = document.getElementById('p1Sets');
    const p2SetsEl = document.getElementById('p2Sets');
    if (p1SetsEl) p1SetsEl.textContent = `${p1Name} (${p1Won}/${p1Total})`;
    if (p2SetsEl) p2SetsEl.textContent = `${p2Name} (${p2Won}/${p2Total})`;
    // Подсветка суммарной доли выигранных сетов (≥ 30 п.п.)
    if (p1SetsEl && p2SetsEl && p1Total > 0 && p2Total > 0) {
      const r1 = p1Won / Math.max(1, p1Total);
      const r2 = p2Won / Math.max(1, p2Total);
      resetHL(p1SetsEl); resetHL(p2SetsEl);
      if (r1 - r2 >= 0.30) {
        p1SetsEl.classList.add('metric-good');
        p2SetsEl.classList.add('metric-bad');
      } else if (r2 - r1 >= 0.30) {
        p2SetsEl.classList.add('metric-good');
        p1SetsEl.classList.add('metric-bad');
      }
    }

    const tbody = document.getElementById('setsTableBody');
    if (tbody) tbody.innerHTML = '';
    
    // Подсветка для "Победы в сетах (общая статистика)"
    // Зеленый: идеальные серии (wins===total, total>=5) — примеры 5/5, 7/7, 10/10
    // Желтый: высокие серии (winRate>=0.8, total>=5) — примеры 4/5, 6/7, 8/10
    const analyzeSetPerformance = (value) => {
      if (value === '-' || !value.includes('/')) return { class: '', highlight: false };
      const [won, total] = value.split('/').map(Number);
      if (!Number.isFinite(won) || !Number.isFinite(total) || total <= 0) return { class: '', highlight: false };
      if (total < 3) return { class: '', highlight: false }; // мало данных
      const winRate = won / Math.max(1, total);
      if (won === total && total >= 5) {
        return { class: 'metric-good', highlight: true };
      }
      if (winRate >= 0.80 && total >= 5) {
        return { class: 'metric-highlight', highlight: true };
      }
      return { class: '', highlight: false };
    };

    // Основные данные по каждому сету с подсветкой
    // New structure rendering first
    if (data?.playerA?.sets && Array.isArray(data.playerA.sets.per)) {
      for (let i = 0; i < 5; i++) {
        const a = data.playerA.sets.per[i] || { win: 0, total: 0 };
        const b = data.playerB?.sets?.per?.[i] || { win: 0, total: 0 };
        const p1Val = a.total ? `${a.win}/${a.total}` : '—';
        const p2Val = b.total ? `${b.win}/${b.total}` : '—';
        const p1Analysis = analyzeSetPerformance(p1Val);
        const p2Analysis = analyzeSetPerformance(p2Val);
        const p1Class = p1Analysis.class;
        const p2Class = p2Analysis.class;
        const b1 = renderReliabilityBadge(a.total);
        const b2 = renderReliabilityBadge(b.total);
        if (tbody) tbody.insertAdjacentHTML('beforeend',
          `<tr>
            <td title="Номер сета">${i+1}</td>
            <td class="${p1Class}" title="Выиграно/всего сетов: ${p1Val}">${p1Val}${b1}</td>
            <td class="${p2Class}" title="Выиграно/всего сетов: ${p2Val}">${p2Val}${b2}</td>
          </tr>`
        );
      }
    } else if (data.playerA.setWins) {
      // Old string structure fallback
      Object.entries(data.playerA.setWins).forEach(([set, [p1Val]]) => {
        const p2Val = data.playerB.setWins && data.playerB.setWins[set] ? data.playerB.setWins[set][0] : '-';
        const p1Analysis = analyzeSetPerformance(p1Val);
        const p2Analysis = analyzeSetPerformance(p2Val);
        const p1Class = p1Analysis.class;
        const p2Class = p2Analysis.class;
        const t1 = (typeof p1Val === 'string' && p1Val.includes('/')) ? Number(p1Val.split('/')[1]) : null;
        const t2 = (typeof p2Val === 'string' && p2Val.includes('/')) ? Number(p2Val.split('/')[1]) : null;
        const b1 = renderReliabilityBadge(t1);
        const b2 = renderReliabilityBadge(t2);
        if (tbody) tbody.insertAdjacentHTML('beforeend',
          `<tr>
            <td title="Номер сета">${set.replace('set', '')}</td>
            <td class="${p1Class}" title="Выиграно/всего сетов: ${p1Val}">${p1Val}${b1}</td>
            <td class="${p2Class}" title="Выиграно/всего сетов: ${p2Val}">${p2Val}${b2}</td>
          </tr>`
        );
      });
    }
    
    // H2H данные по каждому сету (если есть)
    if (data?.h2h?.setWins) {
      // Рассчитываем суммарные H2H показатели
      const h2hP1Total = Object.values(data.h2h.setWins.playerA || {}).reduce((sum, [val]) => {
        const [won, total] = val.split('/').map(Number);
        return sum + (total || 0);
      }, 0);
      const h2hP1Won = Object.values(data.h2h.setWins.playerA || {}).reduce((sum, [val]) => {
        const [won, total] = val.split('/').map(Number);
        return sum + (won || 0);
      }, 0);
      const h2hP2Total = Object.values(data.h2h.setWins.playerB || {}).reduce((sum, [val]) => {
        const [won, total] = val.split('/').map(Number);
        return sum + (total || 0);
      }, 0);
      const h2hP2Won = Object.values(data.h2h.setWins.playerB || {}).reduce((sum, [val]) => {
        const [won, total] = val.split('/').map(Number);
        return sum + (won || 0);
      }, 0);
      
      // Показываем суммарные H2H в заголовочной строке с подсветкой при ≥30 п.п.
      let clsH2HA = '', clsH2HB = '';
      if (h2hP1Total > 0 && h2hP2Total > 0) {
        const rrA = h2hP1Won / Math.max(1, h2hP1Total);
        const rrB = h2hP2Won / Math.max(1, h2hP2Total);
        if (rrA - rrB >= 0.30) { clsH2HA = 'metric-good'; clsH2HB = 'metric-bad'; }
        else if (rrB - rrA >= 0.30) { clsH2HB = 'metric-good'; clsH2HA = 'metric-bad'; }
      }
      tbody.insertAdjacentHTML('beforeend', `<tr class="h2h-summary-row"><td title="Очные по сетам"><strong>H2H</strong></td><td class="${clsH2HA}" title="Выиграно/всего сетов"><strong>${h2hP1Won}/${h2hP1Total}</strong></td><td class="${clsH2HB}" title="Выиграно/всего сетов"><strong>${h2hP2Won}/${h2hP2Total}</strong></td></tr>`);
      
      Object.entries(data.h2h.setWins.playerA || {}).forEach(([set, [p1Val]]) => {
        const p2Val = data.h2h.setWins.playerB && data.h2h.setWins.playerB[set] ? data.h2h.setWins.playerB[set][0] : '-';
        const t1 = (typeof p1Val === 'string' && p1Val.includes('/')) ? Number(p1Val.split('/')[1]) : null;
        const t2 = (typeof p2Val === 'string' && p2Val.includes('/')) ? Number(p2Val.split('/')[1]) : null;
        const b1 = renderReliabilityBadge(t1, {nMax: 8});
        const b2 = renderReliabilityBadge(t2, {nMax: 8});
        tbody.insertAdjacentHTML('beforeend', `<tr class="h2h-set-row"><td title="Номер сета"><strong>${set.replace('set', '')}</strong></td><td title="Выиграно/всего сетов"><strong>${p1Val}${b1}</strong></td><td title="Выиграно/всего сетов"><strong>${p2Val}${b2}</strong></td></tr>`);
      });
    } else if (data?.h2h?.sets) {
      // New H2H structure from analyzer: {A:{per,totalWins,totalSets}, B:{...}}
      const A = data.h2h.sets.A || { per: [], totalWins: 0, totalSets: 0 };
      const B = data.h2h.sets.B || { per: [], totalWins: 0, totalSets: 0 };
      const rrA = A.totalSets>0? A.totalWins/A.totalSets : 0;
      const rrB = B.totalSets>0? B.totalWins/B.totalSets : 0;
      let clsH2HA = '', clsH2HB = '';
      if (A.totalSets>0 && B.totalSets>0) {
        if (rrA - rrB >= 0.30) { clsH2HA='metric-good'; clsH2HB='metric-bad'; }
        else if (rrB - rrA >= 0.30) { clsH2HB='metric-good'; clsH2HA='metric-bad'; }
      }
      if (tbody) tbody.insertAdjacentHTML('beforeend', `<tr class="h2h-summary-row"><td><strong>H2H</strong></td><td class="${clsH2HA}"><strong>${A.totalWins}/${A.totalSets}</strong></td><td class="${clsH2HB}"><strong>${B.totalWins}/${B.totalSets}</strong></td></tr>`);
      for (let i=0;i<5;i++){
        const a=A.per?.[i]||{win:0,total:0}; const b=B.per?.[i]||{win:0,total:0};
        const p1Val = a.total? `${a.win}/${a.total}` : '—';
        const p2Val = b.total? `${b.win}/${b.total}` : '—';
        const b1 = renderReliabilityBadge(a.total,{nMax:8});
        const b2 = renderReliabilityBadge(b.total,{nMax:8});
        if (tbody) tbody.insertAdjacentHTML('beforeend', `<tr class="h2h-set-row"><td><strong>${i+1}</strong></td><td><strong>${p1Val}${b1}</strong></td><td><strong>${p2Val}${b2}</strong></td></tr>`);
      }
    }

    // Убрано: Set-Pivot/Clutch-5th из этого блока
  }

  function fillPatternsTable(data) {
    // Заголовки с именами
    const patName1 = document.getElementById('patName1');
    if (patName1) patName1.textContent = data.playerA.name;
    const patName2 = document.getElementById('patName2');
    if (patName2) patName2.textContent = data.playerB.name;

    const fmtPct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
    const fmtInt = (v) => (v == null ? '—' : String(v));
    const fmtSigned = (v) => (v == null ? '—' : ((v > 0 ? '+' : '') + Math.round(v)));
    const clearHL = (el) => { if (el) { el.classList.remove('metric-good','metric-highlight','metric-bad'); } };

    // Helper for formatting X/Y (Z%)
    const fmtFrac = (obj, isLoss = false) => {
      if (typeof obj === 'number') {
        return `${Math.round(obj * 100)}%`;
      }
      if (!obj || typeof obj.rate !== 'number') return '—';
      const num = isLoss ? (obj.losses ?? 0) : (obj.wins ?? 0);
      const den = obj.total ?? 0;
      return `${num}/${den} (${Math.round(obj.rate * 100)}%)`;
    };

    // Enriched cell rendering: add reliability badge and trend arrow vs оппонент
    const getRateTotal = (obj, {preferLoss=false}={}) => {
      if (obj == null) return {rate:null,total:null,wins:null,losses:null};
      if (typeof obj === 'number' && isFinite(obj)) return {rate: Math.max(0, Math.min(1, obj)), total: null, wins:null, losses:null};
      if (typeof obj === 'object') {
        const total = typeof obj.total === 'number' ? obj.total : null;
        const wins = typeof obj.wins === 'number' ? obj.wins : null;
        const losses = typeof obj.losses === 'number' ? obj.losses : null;
        let rate = typeof obj.rate === 'number' ? obj.rate : null;
        if (rate == null && total != null && total > 0) {
          if (preferLoss && losses != null) rate = losses / total;
          else if (!preferLoss && wins != null) rate = wins / total;
        }
        return {rate, total, wins, losses};
      }
      return {rate:null,total:null,wins:null,losses:null};
    };
    // Отменяем вывод бейджа надёжности и тренда в строках паттернов
    const reliabilityBadge = (_total) => '';
    const trendArrow = (_rate, _peerRate) => '';
    const setPatCell = (el, obj, peerRate=null, {preferLoss=false}={}) => {
      if (!el) return;
      const {rate,total,wins,losses} = getRateTotal(obj,{preferLoss});
      let main;
      if (total == null && typeof obj === 'number') main = `${Math.round(obj*100)}%`;
      else if (total != null) {
        const num = preferLoss ? (losses||0) : (wins||0);
        main = `${num}/${total} (${Math.round((rate||0)*100)}%)`;
      } else { main = '—'; }
      el.textContent = main;
    };

    // После 1:0 → победа
    const pAfter10_1 = document.getElementById('pAfter10_1');
    const pAfter10_2 = document.getElementById('pAfter10_2');
    const p10a = data.playerA.patterns?.win_after_1_0 ?? null;
    const p10b = data.playerB.patterns?.win_after_1_0 ?? null;
    setPatCell(pAfter10_1, p10a, p10b?.rate);
    setPatCell(pAfter10_2, p10b, p10a?.rate);
    hlPctPositive(pAfter10_1, p10a?.rate ?? null, p10b?.rate ?? null);
    hlPctPositive(pAfter10_2, p10b?.rate ?? null, p10a?.rate ?? null);

    // (удалено) Потери после ведения 1:0

    // После 0:1 → победа
    const pAfter01_1 = document.getElementById('pAfter01_1');
    const pAfter01_2 = document.getElementById('pAfter01_2');
    const p01a = data.playerA.patterns?.win_after_0_1 ?? null;
    const p01b = data.playerB.patterns?.win_after_0_1 ?? null;
    setPatCell(pAfter01_1, p01a, p01b?.rate);
    setPatCell(pAfter01_2, p01b, p01a?.rate);
    hlPctPositive(pAfter01_1, p01a?.rate ?? null, p01b?.rate ?? null);
    hlPctPositive(pAfter01_2, p01b?.rate ?? null, p01a?.rate ?? null);

    // Поражение после 2:1 — зелёный если всё хорошо (нет случаев), ярко-красный если есть хоть 1
    const pLoss21_1 = document.getElementById('pLoss21_1');
    // Фоллбэк: legacy поле называлось loss_after2_1 (без нижних подчёркиваний)
    const l21a = data.playerA.patterns?.loss_after_2_1_obj
               ?? data.playerA.patterns?.loss_after_2_1
               ?? data.playerA.patterns?.loss_after2_1
               ?? null;
    // Сразу получим и метрику для B, чтобы использовать её как peerRate
    const l21b = data.playerB.patterns?.loss_after_2_1_obj
               ?? data.playerB.patterns?.loss_after_2_1
               ?? data.playerB.patterns?.loss_after2_1
               ?? null;
    if (pLoss21_1) setPatCell(pLoss21_1, l21a, l21b?.rate, {preferLoss:true});
    resetHL(pLoss21_1);
    if (l21a && typeof l21a.total === 'number') {
      const lossesA = l21a.losses || 0;
      if (lossesA >= 1) applyTier(pLoss21_1, 'bad');
      else if (l21a.total >= 1) applyTier(pLoss21_1, 'good');
    }

    const pLoss21_2 = document.getElementById('pLoss21_2');
    if (pLoss21_2) setPatCell(pLoss21_2, l21b, l21a?.rate, {preferLoss:true});
    resetHL(pLoss21_2);
    if (l21b && typeof l21b.total === 'number') {
      const lossesB = l21b.losses || 0;
      if (lossesB >= 1) applyTier(pLoss21_2, 'bad');
      else if (l21b.total >= 1) applyTier(pLoss21_2, 'good');
    }

    // После 1:2 → победа
    const pAfter12_1 = document.getElementById('pAfter12_1');
    const pAfter12_2 = document.getElementById('pAfter12_2');
    const p12a = data.playerA.patterns?.win_after_1_2 ?? null;
    const p12b = data.playerB.patterns?.win_after_1_2 ?? null;
    setPatCell(pAfter12_1, p12a, p12b?.rate);
    setPatCell(pAfter12_2, p12b, p12a?.rate);
    hlPctPositive(pAfter12_1, p12a?.rate ?? null, p12b?.rate ?? null);
    hlPctPositive(pAfter12_2, p12b?.rate ?? null, p12a?.rate ?? null);

    // Победы при серии из двух выигранных сетов
    const pTwoRun_1 = document.getElementById('pTwoRun_1');
    const pTwoRun_2 = document.getElementById('pTwoRun_2');
    const twoRunA = data.playerA.patterns?.win_two_set_run ?? null;
    const twoRunB = data.playerB.patterns?.win_two_set_run ?? null;
    setPatCell(pTwoRun_1, twoRunA, twoRunB?.rate);
    setPatCell(pTwoRun_2, twoRunB, twoRunA?.rate);
    hlPctPositive(pTwoRun_1, twoRunA?.rate ?? null, twoRunB?.rate ?? null);
    hlPctPositive(pTwoRun_2, twoRunB?.rate ?? null, twoRunA?.rate ?? null);

    // Поражения при серии из двух выигранных сетов (ниже — лучше)
    const pTwoRunLoss_1 = document.getElementById('pTwoRunLoss_1');
    const pTwoRunLoss_2 = document.getElementById('pTwoRunLoss_2');
    const twoRunLossA = data.playerA.patterns?.loss_after_two_set_run ?? null;
    const twoRunLossB = data.playerB.patterns?.loss_after_two_set_run ?? null;
    if (pTwoRunLoss_1) setPatCell(pTwoRunLoss_1, twoRunLossA, twoRunLossB?.rate, {preferLoss:true});
    if (pTwoRunLoss_2) setPatCell(pTwoRunLoss_2, twoRunLossB, twoRunLossA?.rate, {preferLoss:true});
    hlPctNegative(pTwoRunLoss_1, twoRunLossA?.rate ?? null, twoRunLossB?.rate ?? null);
    hlPctNegative(pTwoRunLoss_2, twoRunLossB?.rate ?? null, twoRunLossA?.rate ?? null);

    // При 2:2 → победа (решающий сет)
    const pAt22_1 = document.getElementById('pAt22_1');
    const pAt22_2 = document.getElementById('pAt22_2');
    // Приоритет: новая метрика decisive_fifth_wins, затем win_at_2_2, затем win_5th_set
    const p22a = data.playerA.patterns?.decisive_fifth_wins ?? data.playerA.patterns?.win_at_2_2 ?? data.playerA.patterns?.win_5th_set ?? null;
    const p22b = data.playerB.patterns?.decisive_fifth_wins ?? data.playerB.patterns?.win_at_2_2 ?? data.playerB.patterns?.win_5th_set ?? null;
    setPatCell(pAt22_1, p22a, p22b?.rate);
    setPatCell(pAt22_2, p22b, p22a?.rate);
    hlPctPositive(pAt22_1, p22a?.rate ?? null, p22b?.rate ?? null);
    hlPctPositive(pAt22_2, p22b?.rate ?? null, p22a?.rate ?? null);

    // Проигрыши тай-брейков
    const pTiebreakLoss_1 = document.getElementById('pTiebreakLoss_1');
    const pTiebreakLoss_2 = document.getElementById('pTiebreakLoss_2');
    const tbLossA = data.playerA.patterns?.tiebreak_losses ?? null;
    const tbLossB = data.playerB.patterns?.tiebreak_losses ?? null;
    if (pTiebreakLoss_1) setPatCell(pTiebreakLoss_1, tbLossA, tbLossB?.rate, {preferLoss:true});
    if (pTiebreakLoss_2) setPatCell(pTiebreakLoss_2, tbLossB, tbLossA?.rate, {preferLoss:true});
    hlPctNegative(pTiebreakLoss_1, tbLossA?.rate ?? null, tbLossB?.rate ?? null);
    hlPctNegative(pTiebreakLoss_2, tbLossB?.rate ?? null, tbLossA?.rate ?? null);
    // Текстовые подписи не используем — подсветка цветом уже задана hlPctNegative

    // (убрано) Потери решающих тай-брейков / 5-го сета

    // После 0:2 → победа
    const from02_1 = document.getElementById('from02_1');
    const from02_2 = document.getElementById('from02_2');
    // Предпочитаем новый более общий паттерн: победа после двух подряд проигранных сетов (в любом месте матча)
    const pf02a = data.playerA.patterns?.come_from_two_set_down ?? data.playerA.patterns?.come_from_0_2_win ?? null;
    const pf02b = data.playerB.patterns?.come_from_two_set_down ?? data.playerB.patterns?.come_from_0_2_win ?? null;
    const fmtFrac02 = (val) => {
      if (val == null) return '—';
      if (typeof val === 'object') {
        const wins = typeof val.wins === 'number' ? val.wins : 0;
        const total = typeof val.total === 'number' ? val.total : 0;
        const rate = (typeof val.rate === 'number') ? val.rate : (total > 0 ? wins/total : 0);
        if (total === 0) return '—';
        return `${wins}/${total} (${Math.round(rate * 100)}%)`;
      }
      if (typeof val === 'number' && isFinite(val)) {
        return `${Math.round(val * 100)}%`;
      }
      return '—';
    };
    if (from02_1) from02_1.textContent = fmtFrac02(pf02a);
    if (from02_2) from02_2.textContent = fmtFrac02(pf02b);
    const rate02a = (pf02a && typeof pf02a === 'object') ? pf02a.rate : (typeof pf02a === 'number' ? pf02a : null);
    const rate02b = (pf02b && typeof pf02b === 'object') ? pf02b.rate : (typeof pf02b === 'number' ? pf02b : null);
    hlPctPositive(from02_1, rate02a, rate02b);
    hlPctPositive(from02_2, rate02b, rate02a);

    // (удалены строки: Победа в 5-м сете, Камбэки (шт.), Сухие поражения)

    // (строка «Средняя разница очков» перенесена в блок Статистика игроков)

    // Новый EXT/PF по спецификации: прямые доли без внешних факторов
    const patExt1  = document.getElementById('patExt1');
    const patExt2  = document.getElementById('patExt2');
    const patPF1   = document.getElementById('patPF1');
    const patPF2   = document.getElementById('patPF2');
    const clamp01 = (x) => Math.max(0, Math.min(1, Number(x)||0));
    const getRate = (obj, {preferLoss=false}={}) => {
      if (!obj) return 0.5;
      if (typeof obj.rate === 'number') return clamp01(obj.rate);
      const total = Number(obj.total||0);
      if (total<=0) return 0.5;
      const wins = Number(preferLoss ? obj.losses||0 : obj.wins||0);
      return clamp01(wins/Math.max(1,total));
    };
    const computeEXT = (pats) => {
      const C1 = 1 - getRate(pats?.loss_after_2_1_obj, {preferLoss:true});
      const C2 = 1 - getRate(pats?.loss_after_two_set_run, {preferLoss:true});
      const C3 = 1 - getRate(pats?.tiebreak_losses, {preferLoss:true});
      const C4 = getRate(pats?.decisive_fifth_wins ?? pats?.win_at_2_2);
      const ext = (0.30*C1 + 0.30*C2 + 0.20*C3 + 0.20*C4) * 100;
      return Math.round(ext);
    };
    const computePF = (pats) => {
      const P1 = getRate(pats?.win_after_1_0);
      const P2 = getRate(pats?.win_after_0_1);
      const P3 = getRate(pats?.win_after_1_2);
      const P4 = getRate(pats?.come_from_0_2_win);
      const pf = (0.35*P1 + 0.30*P2 + 0.20*P3 + 0.15*P4) * 100;
      return Math.round(pf);
    };
    const extA = computeEXT(data.playerA.patterns || {});
    const extB = computeEXT(data.playerB.patterns || {});
    const pfA  = computePF(data.playerA.patterns || {});
    const pfB  = computePF(data.playerB.patterns || {});
    if (patExt1) patExt1.textContent = isFinite(extA) ? `${extA}%` : '—';
    if (patExt2) patExt2.textContent = isFinite(extB) ? `${extB}%` : '—';
    if (patPF1)  patPF1.textContent  = isFinite(pfA)  ? `${pfA}%`  : '—';
    if (patPF2)  patPF2.textContent  = isFinite(pfB)  ? `${pfB}%`  : '—';
  }

  function fillDeciderInfo(data) {
    const fmt = (v) => (v == null || isNaN(v) ? '—' : `${Math.round(v * 100)}%`);
    const toNum = (x) => (typeof x === 'number' ? x : parseFloat(String(x).replace('%',''))/100);
    const d = data.decider || {};
    // Две оценки: без H2H и с H2H (если >=5 матчей H2H)
    let baseNoH2H = (typeof d.p5_no_h2h === 'number') ? d.p5_no_h2h : ((d.empP5 != null) ? d.empP5 : d.probBT);
    const h2hOnly = (typeof d.p5_with_h2h === 'number') ? d.p5_with_h2h : null;
    // Fallbacks if server-side didn't compute
    if (baseNoH2H == null) {
      try {
        if (Array.isArray(data.btScoreProbs) && data.btScoreProbs.length) {
          const a = data.btScoreProbs.find(x => x.score === '3:2');
          const b = data.btScoreProbs.find(x => x.score === '2:3');
          const pa = a ? toNum(a.probability ?? a.label) : 0;
          const pb = b ? toNum(b.probability ?? b.label) : 0;
          baseNoH2H = pa + pb;
        } else if (Array.isArray(data.predictedScores) && data.predictedScores.length) {
          const a = data.predictedScores.find(x => x.score === '3:2');
          const b = data.predictedScores.find(x => x.score === '2:3');
          const pa = a ? toNum(a.probability) : 0;
          const pb = b ? toNum(b.probability) : 0;
          baseNoH2H = pa + pb;
        }
      } catch(_) {}
    }
    const cellNo = document.getElementById('prob5thNoH2H');
    const cellH2H = document.getElementById('prob5thH2H');
    const baseText = fmt(baseNoH2H);
    if (cellNo) {
      cellNo.innerHTML = `
        <span class="pill pill-muted">без H2H</span>
        <span class="pill pill-value">${baseText}</span>
      `;
    }
    if (cellH2H) {
      if (h2hOnly != null) {
        const h2hText = fmt(h2hOnly);
        cellH2H.innerHTML = `
          <span class="pill pill-muted">H2H</span>
          <span class="pill pill-value-h2h">${h2hText}</span>
        `;
      } else {
        cellH2H.innerHTML = `
          <span class="pill pill-muted">H2H</span>
          <span class="pill pill-value-h2h">—</span>
        `;
      }
    }
  }

  // Индикатор согласованности модулей и краткая расшифровка вкладов (человекочитаемо)
  function renderConsistencyAndExplain(d, consResult) {
    try {
      const list = document.getElementById('consExplain');
      if (!list) return;

      // Модули: BT, EffStrength, H2H по сетам, TB+5-й
      const strengthA = parseFloat(d.playerA?.mainStrength ?? d.playerA?.strength ?? 0) || 0;
      const strengthB = parseFloat(d.playerB?.mainStrength ?? d.playerB?.strength ?? 0) || 0;
      const stabilityA = parseFloat(d.playerA?.stability ?? 0) || 0;
      const stabilityB = parseFloat(d.playerB?.stability ?? 0) || 0;
      const gamesTodayA = Number(d.playerA?.matchesToday?.total || 0);
      const gamesTodayB = Number(d.playerB?.matchesToday?.total || 0);
      const pBT = (typeof d.bt_p_match === 'number') ? d.bt_p_match : 0.5;

      const eff = (typeof Consensus !== 'undefined' && Consensus.computeEffStrengths)
        ? Consensus.computeEffStrengths({strengthA, strengthB, stabilityA, stabilityB, gamesTodayA, gamesTodayB})
        : {eff_gap: 0};
      const h2h = d?.h2h?.setWins?.detailed;
      const setsA = h2h?.summary?.playerAWins || 0;
      const setsB = h2h?.summary?.playerBWins || 0;
      const h2hGap = (setsA + setsB) > 0 ? (setsA - setsB)/(setsA + setsB) : 0;
      const tbLossA = d?.playerA?.patterns?.tiebreak_losses?.rate;
      const tbLossB = d?.playerB?.patterns?.tiebreak_losses?.rate;
      const tb_edge = (1 - (tbLossA ?? 0.5)) - (1 - (tbLossB ?? 0.5));
      const p5_base = (typeof d?.decider?.p5_no_h2h === 'number') ? d.decider.p5_no_h2h : 0;

      const p_strength = 1/(1+Math.exp(-1.2 * (eff.eff_gap || 0)));
      const p_h2h = 0.5 + 0.8 * h2hGap;
      const p_tb5 = 0.5 + 0.6 * tb_edge * p5_base;

      const vals = [pBT, p_strength, p_h2h, p_tb5].map(v => Math.max(0, Math.min(1, v)));
      const spread = Math.max(...vals) - Math.min(...vals);
      // consistency badge отключён — ничего не рисуем

      // Топ-3 вклада по |value| с направлением и силой
      list.innerHTML = '';
      const terms = consResult?.terms || {};
      const items = Object.entries(terms)
        .map(([k,v]) => ({k,v,abs:Math.abs(v)}))
        .sort((a,b)=>b.abs-a.abs)
        .slice(0,3);
      const labels = { t_bt: 'BT', t_strength: 'Эфф. сила', t_stab: 'Стабильность', t_h2h_sets: 'H2H по сетам', t_set3: '3-й сет', t_tb: 'Тай-брейки', t_load: 'Нагрузка', t_rematch: 'Рематч', t_tb5: 'TB + 5-й', t_stabFlag: 'Стабильность андердога' };
      const nameA = d?.playerA?.name || 'A';
      const nameB = d?.playerB?.name || 'B';
      const strengthOf = (x)=> x < 0.10 ? 'слабо' : x < 0.25 ? 'умеренно' : 'сильно';
      items.forEach(it => {
        const li = document.createElement('li');
        const name = labels[it.k] || it.k;
        const dir = it.v >= 0 ? `за ${nameA}` : `за ${nameB}`;
        const lvl = strengthOf(Math.abs(it.v));
        li.textContent = `${name}: ${dir} (${lvl})`;
        list.appendChild(li);
      });

      // base: без обязательного добавления дополнительных факторов
    } catch(_) {}
  }

  // Присвоение всплывающих подсказок (title) для показателей
  function applyHelpTitles() {
    const setTitle = (id, text) => { const el = document.getElementById(id); if (el) el.title = text; };
    const setBoth = (id1, id2, text) => { setTitle(id1, text); setTitle(id2, text); };

    // Основные показатели
    setBoth('mainStrengthA','mainStrengthB','Сила — 0–100: комплексная оценка недавней силы игрока.');
    setBoth('effStrengthA','effStrengthB','Эффективная сила — учитывает стабильность и нагрузку сегодня.');
    setBoth('mainH2HA','mainH2HB','H2H — очные встречи: победы–проигрыши.');
    setBoth('mainStabilityA','mainStabilityB','Стабильность — 0–100%: устойчивость игры (выше — ровнее).');

    // Статистика игроков
    setBoth('s2Player1','s2Player2','S₂ — сила по последним 2 матчам (0–100).');
    setBoth('s5Player1','s5Player2','S₅ — сила по последним 5 матчам (0–100).');
    setBoth('matchesToday1','matchesToday2','Матчей сегодня — сколько матчей сыграно сегодня (косвенно — усталость).');
    setBoth('lastGame1','lastGame2','Последняя игра — дней с последнего официального матча.');
    setBoth('scorePoints1','scorePoints2','Очки (5 матчей) — суммарный баланс очков и средний за сет.');
    setBoth('avgPtsDiffStat1','avgPtsDiffStat2','Разница очков (5 матчей) — сумма и средняя за матч.');
    setBoth('avgPtsDiff10Stat1','avgPtsDiff10Stat2','Разница очков (10 матчей) — сумма и средняя за матч.');

    // Вероятность (без BT)
    setBoth('probNoBtA','probNoBtB','Вероятность (без BT) — без H2H и без модели Брэдли–Терри. Три значения: 10/5/3 последних игр.');
    // убрано: вероятность 5-го сета

    // Паттерны (последние 5 матчей)
    setBoth('pAfter10_1','pAfter10_2','Победа, если взят 1-й сет (X/Y и доля).');
    setBoth('pAfter01_1','pAfter01_2','Победа, если проигран 1-й сет (X/Y и доля).');
    setBoth('pLoss21_1','pLoss21_2','Поражения, ведя 2:1 (ниже — лучше).');
    setBoth('pAfter12_1','pAfter12_2','Победа, проигрывая 1:2 (камбэк 1:2).');
    setBoth('pTwoRun_1','pTwoRun_2','Победа при серии из двух выигранных сетов подряд.');
    setBoth('pTwoRunLoss_1','pTwoRunLoss_2','Поражения при серии из двух выигранных сетов (ниже — лучше).');
    setBoth('pAt22_1','pAt22_2','Победа при счёте 2:2 — решающий 5-й сет.');
    setBoth('from02_1','from02_2','Победа после двух подряд проигранных сетов (в т.ч. камбэк с 0:2).');
    setBoth('pTiebreakLoss_1','pTiebreakLoss_2','Проигрыши тай-брейков (ниже — лучше).');
    setBoth('patExt1','patExt2','EXT — кризисная надёжность: удержание лидера и клатч-концовки.');
    setBoth('patPF1','patPF2','PF — поведение/камбэки: закрепление инициативы и отыгрыши.');

    // Индекс согласия
    setTitle('consBadge','Индекс согласия: A — надёжно; B — умеренно; C — монета; D — противоречия.');
    setTitle('consProb','p — согласованная вероятность победы игрока A (верхняя строка).');

    // Красные флаги — блок отключён
  }

  function fillNonBTProbability(data) {
    // helper: render compact warning with a help icon and faint probability text (без эмодзи)
    const setWarnWithHelp = (cell, reasons, probText = null, {highlight=false}={}) => {
      if (!cell) return;
      // Reset content first to avoid duplicating icons on re-render
      const list = Array.isArray(reasons) ? reasons.filter(Boolean) : (reasons ? [reasons] : []);
      const n = Math.max(1, list.length || 1);
      const listLines = list.length ? list.map((r, i) => `${i+1}. ${r}`).join('\n') : '1. недостаточно данных';
      const msg = list.length ? list.join(' • ') : 'недостаточно данных';
      cell.innerHTML = '';
      // Base label (highlight for favorite)
      const base = document.createElement('span');
      if (highlight) base.classList.add('fav-mark');
      base.textContent = 'Предупреждение';
      cell.appendChild(base);
      // Tooltip (кратко)
      cell.title = `Есть причины. Наведите на ❓ для списка.`;
      // Add a small question icon with its own tooltip
      const help = document.createElement('span');
      help.className = 'help-icon';
      help.textContent = '❓';
      help.title = listLines; // только список причин, без префикса
      help.setAttribute('aria-label', listLines);
      help.style.marginLeft = '6px';
      cell.appendChild(help);
      if (probText) {
        const hint = document.createElement('span');
        hint.className = 'muted-prob';
        try { hint.innerHTML = String(probText).replace(/\n/g, '<br/>'); }
        catch(_) { hint.textContent = probText; }
        cell.appendChild(hint);
      }
    };
    const aNameEl = document.getElementById('probNoBtNameA');
    const bNameEl = document.getElementById('probNoBtNameB');
    const aValEl = document.getElementById('probNoBtA');
    const bValEl = document.getElementById('probNoBtB');
    const nameA = data.playerA.name;
    const nameB = data.playerB.name;

    // Определим фаворита для блока «без BT» по nonBTProbability (фоллбэк — по общей probability)
    const parseNum = (v) => {
      if (v == null) return null;
      const n = (typeof v === 'number') ? v : parseFloat(String(v).replace('%',''));
      return isNaN(n) ? null : n;
    };
    let aProbRaw = data.playerA?.nonBTProbability; if (aProbRaw == null || isNaN(parseFloat(aProbRaw))) aProbRaw = data.playerA?.probability;
    let bProbRaw = data.playerB?.nonBTProbability; if (bProbRaw == null || isNaN(parseFloat(bProbRaw))) bProbRaw = data.playerB?.probability;
    let aNum = parseNum(aProbRaw);
    let bNum = parseNum(bProbRaw);
    // Нормализуем в проценты, если пришло в долях 0..1
    if (aNum != null && bNum != null && aNum <= 1 && bNum <= 1) { aNum *= 100; bNum *= 100; }
    // defer 10/5/3 formatting later in one place
    // Не назначаем фаворита, если разница меньше порога (во избежание ложных фаворитов из-за округления)
    const margin = 0.5; // п.п.
    const favIsA = (aNum != null && bNum != null) ? (Math.abs(aNum - bNum) >= margin ? (aNum > bNum) : null) : null;

    // Render names with text-only highlight
    if (aNameEl) {
      if (favIsA === true) aNameEl.innerHTML = `<span class="fav-mark">${nameA} (Фаворит)</span>`;
      else if (favIsA === false) aNameEl.innerHTML = `${nameA} (Аутсайдер)`;
      else aNameEl.textContent = nameA; // равные шансы
    }
    if (bNameEl) {
      if (favIsA === true) bNameEl.innerHTML = `${nameB} (Аутсайдер)`;
      else if (favIsA === false) bNameEl.innerHTML = `<span class="fav-mark">${nameB} (Фаворит)</span>`;
      else bNameEl.textContent = nameB; // равные шансы
    }

    // Причины предупреждений отключены по запросу — показываем значения без бейджа
    const reasons = [];

    // Паттерн: у фаворита есть поражение после 2:1 (1/1 и более)
    try {
      const favLossObj = favIsA ? (data?.playerA?.patterns?.loss_after_2_1_obj) : (data?.playerB?.patterns?.loss_after_2_1_obj);
      const favFlag = favLossObj && typeof favLossObj.total === 'number' && favLossObj.total >= 1 && (favLossObj.losses || 0) >= 1;
      if (favFlag) {
        reasons.push(`${favIsA ? nameA : nameB}: поражение после 2:1`);
      }
    } catch (_) {}

    // Очки (5 матчей): у обоих один и тот же знак (оба + или оба -) — нестабильность
    try {
      const tp1 = parseFloat(data?.playerA?.scorePoints?.totalPoints);
      const tp2 = parseFloat(data?.playerB?.scorePoints?.totalPoints);
      if (!isNaN(tp1) && !isNaN(tp2)) {
        const bothPositive = tp1 > 0 && tp2 > 0;
        const bothNegative = tp1 < 0 && tp2 < 0;
        if (bothPositive || bothNegative) {
          const note = bothPositive ? 'оба плюс' : 'оба минус';
          reasons.push(`Очки (5 матчей): ${note}`);
        }
      }
    } catch (_) {}

    // Сбор строк 10/5/3: без H2H и с H2H (подсветка значений >= +10 п.п. относительно оппонента)
    const fmtPct = (v) => (v == null ? '-' : `${parseFloat(v).toFixed(1)}%`);
    const num = (v)=> (typeof v==='number'? v : (v!=null? parseFloat(v): NaN));
    const decorateTriple = (p10,p5,p3, q10,q5,q3) => {
      const w10 = (isFinite(p10)&&isFinite(q10)) ? ((p10 - q10) >= 10) : false;
      const w5  = (isFinite(p5) &&isFinite(q5 )) ? ((p5  - q5 ) >= 10) : false;
      const w3  = (isFinite(p3) &&isFinite(q3 )) ? ((p3  - q3 ) >= 10) : false;
      return `10: <span class=\"nb-val-pt ${w10?'nb-win':''}\">${fmtPct(p10)}</span> • 5: <span class=\"nb-val-pt ${w5?'nb-win':''}\">${fmtPct(p5)}</span> • 3: <span class=\"nb-val-pt ${w3?'nb-win':''}\">${fmtPct(p3)}</span>`;
    };
    const A10 = num(data?.playerA?.nonBTProbability10 ?? data?.playerA?.nonBTProbability);
    const A5  = num(data?.playerA?.nonBTProbability5);
    const A3  = num(data?.playerA?.nonBTProbability3);
    const B10 = num(data?.playerB?.nonBTProbability10 ?? data?.playerB?.nonBTProbability);
    const B5  = num(data?.playerB?.nonBTProbability5);
    const B3  = num(data?.playerB?.nonBTProbability3);
    const A10h = num(data?.playerA?.nonBTProbability10_h2h);
    const A5h  = num(data?.playerA?.nonBTProbability5_h2h);
    const A3h  = num(data?.playerA?.nonBTProbability3_h2h);
    const B10h = num(data?.playerB?.nonBTProbability10_h2h);
    const B5h  = num(data?.playerB?.nonBTProbability5_h2h);
    const B3h  = num(data?.playerB?.nonBTProbability3_h2h);
    const compA    = decorateTriple(A10, A5, A3,  B10, B5, B3);
    const compB    = decorateTriple(B10, B5, B3,  A10, A5, A3);
    const compAh2h = decorateTriple(A10h,A5h,A3h, B10h,B5h,B3h);
    const compBh2h = decorateTriple(B10h,B5h,B3h, A10h,A5h,A3h);

    // Больше не выводим предупреждения — даже при причинах показываем структурированные значения — даже при причинах показываем структурированные значения

    let a = data.playerA?.nonBTProbability;
    let b = data.playerB?.nonBTProbability;
    // Фоллбэк: если nonBTProbability не пришла, используем общую вероятность из модели (без BT)
    if (a == null || isNaN(parseFloat(a))) a = data.playerA?.probability;
    if (b == null || isNaN(parseFloat(b))) b = data.playerB?.probability;
    const fmt = (x)=> (x != null && !isNaN(parseFloat(x))) ? (parseFloat(x).toFixed(1) + '%') : '-';
    // Формируем строки 10/5/3 для вывода (две строки: без H2H и с H2H)
    const aOutBase = compA;
    const bOutBase = compB;
    const aOutH2H  = compAh2h;
    const bOutH2H  = compBh2h;
    // Tooltip builder for dynamics explanation: Δ(5−10) and Δ(3−5)
    const buildDynTooltip = (p10, p5, p3) => {
      const toNum = (v)=> (typeof v==='number'? v : (v!=null? parseFloat(v): NaN));
      const n10 = toNum(p10), n5 = toNum(p5), n3 = toNum(p3);
      if (!isFinite(n10) || !isFinite(n5) || !isFinite(n3)) return 'Δ(5−10): изменение за последние 5 матчей\nΔ(3−5): свежий импульс формы\n↑ — рост, ↓ — спад';
      const d510 = Math.round((n5 - n10)*10)/10;
      const d35  = Math.round((n3 - n5)*10)/10;
      const arrow = (x)=> x>0? '↑' : (x<0? '↓' : '•');
      const s = (x)=> (x>=0? '+' : '') + x.toFixed(1) + '% ' + arrow(x);
      return `Δ(5−10): ${s(d510)}\nΔ(3−5): ${s(d35)}\n↑ — рост, ↓ — спад, цвет = риск`;
    };
    const buildDynInline = (p10,p5,p3, opp10,opp5,opp3) => {
      const toNum = (v)=> (typeof v==='number'? v : (v!=null? parseFloat(v): NaN));
      const n10 = toNum(p10), n5 = toNum(p5), n3 = toNum(p3);
      const o10 = toNum(opp10), o5 = toNum(opp5), o3 = toNum(opp3);
      if (!isFinite(n10) || !isFinite(n5) || !isFinite(n3)) return '';
      const d510 = Math.round((n5 - n10));
      const d35  = Math.round((n3 - n5));
      const o510 = (isFinite(o10)&&isFinite(o5))? Math.round((o5 - o10)) : NaN;
      const o35  = (isFinite(o3)&&isFinite(o5))? Math.round((o3 - o5)) : NaN;
      const arrow = (x)=> x>0? '↑' : (x<0? '↓' : '•');
      const s = (x, better)=> `<span class=\"${better? 'nb-win' : ''}\">${(x>=0? '+' : '') + Math.abs(x)}% ${arrow(x)}</span>`;
      const better510 = isFinite(o510) ? (d510 > o510) : (d510>0);
      const better35  = isFinite(o35)  ? (d35  > o35)  : (d35>0);
      return `Δ(5−10): ${s(d510, better510)}   Δ(3−5): ${s(d35, better35)}`;
    };
    const nbHTML = (base, h2h, highlight=false, tt='', dyn='') => (
      `<div class=\"nb-entry\" title=\"${tt.replace(/\"/g,'\\\"')}\">`
      + `<div class=\"nb-line\"><span class=\"nb-cap\">без H2H</span><span class=\"nb-val\">${base}</span></div>`
      + (dyn ? `<div class=\"nb-line nb-delta\">${dyn}</div>` : '')
      + (h2h && h2h.includes('%') ? `<div class=\"nb-line nb-h2h\"><span class=\"nb-cap\">с H2H</span><span class=\"nb-val\">${h2h}</span></div>` : '')
      + `</div>`
    );
    if (aValEl) {
      aValEl.removeAttribute('title');
      const tA = buildDynTooltip(A10, A5, A3);
      const dynA = buildDynInline(A10, A5, A3, B10, B5, B3);
      aValEl.innerHTML = nbHTML(aOutBase, aOutH2H, favIsA === true, tA, dynA);
    }
    if (bValEl) {
      bValEl.removeAttribute('title');
      const tB = buildDynTooltip(B10, B5, B3);
      const dynB = buildDynInline(B10, B5, B3, A10, A5, A3);
      bValEl.innerHTML = nbHTML(bOutBase, bOutH2H, favIsA === false, tB, dynB);
    }
  }

  function fillCommonOpponents(data) {
    const block = document.getElementById('commonOppBlock');
    const summaryEl = document.getElementById('commonOppSummary');
    const nameA = document.getElementById('commonOppNameA');
    const nameB = document.getElementById('commonOppNameB');
    const tbody = document.getElementById('commonOppTableBody');

    if (nameA) nameA.textContent = data.playerA.name;
    if (nameB) nameB.textContent = data.playerB.name;

    const items = data.commonOpponents || [];
    if (!items.length) {
      if (block) block.style.display = 'none';
      return;
    }
    if (block) block.style.display = '';

    if (summaryEl) summaryEl.textContent = data.commonOppSummary || '';
    if (tbody) tbody.innerHTML = '';

    const fmtRow = (o) => {
      const pts = (o.pointsDiff > 0 ? '+' : '') + (o.pointsDiff || 0);
      return `${o.wins}-${o.losses} (сеты ${o.setsWon}-${o.setsLost}, очки ${pts})`;
    };

    // Determine favorite side by non-BT if available; fallback to BT
    const nbA = (typeof data.playerA?.nonBTProbability === 'number') ? data.playerA.nonBTProbability : null;
    const nbB = (typeof data.playerB?.nonBTProbability === 'number') ? data.playerB.nonBTProbability : null;
    let favSide = null;
    if (nbA!=null && nbB!=null) favSide = (nbA>=nbB? 'A':'B');
    else if (typeof data.bt_p_match === 'number') favSide = (data.bt_p_match>=0.5? 'A':'B');

    items.forEach(row => {
      const adv = row.advantage;
      let aCellClass = adv === 'A' ? 'metric-highlight' : (adv === 'B' ? 'metric-bad' : '');
      let bCellClass = adv === 'B' ? 'metric-highlight' : (adv === 'A' ? 'metric-bad' : '');
      if (favSide && adv && adv !== '=') {
        // If advantage not for favorite — mark red on the side with advantage
        if (adv !== favSide) {
          if (adv === 'A') { aCellClass = 'metric-bad'; bCellClass = ''; }
          if (adv === 'B') { bCellClass = 'metric-bad'; aCellClass = ''; }
        }
      }
      const advLabel = adv === 'A' ? data.playerA.name : (adv === 'B' ? data.playerB.name : '—');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.opponent}</td>
        <td class="${aCellClass}">${fmtRow(row.a)}</td>
        <td class="${bCellClass}">${fmtRow(row.b)}</td>
        <td>${advLabel}</td>
      `;
      tbody && tbody.appendChild(tr);
    });
  }

  // === Успешность: один график с двумя линиями (10 игр + прогноз 11-й) ===
  function drawOverlaySuccessChart(canvas, sA, predA, sB, predB, opts = {}) {
    try {
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0,0,W,H);

      const grid = opts.grid || '#e5e7eb';
      const colA = opts.colA || '#34d399';
      const colB = opts.colB || '#60a5fa';

      // Grid lines at 0/50/100
      ctx.save();
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      const gy = (v)=> Math.round(H - (v/100)*H) + 0.5;
      [0,50,100].forEach(v => { ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(W, gy(v)); ctx.stroke(); });
      ctx.restore();

      const lenA = Array.isArray(sA) ? sA.length : 0;
      const lenB = Array.isArray(sB) ? sB.length : 0;
      const n = Math.max(lenA, lenB);
      if (!n) return;
      const stepX = (W - 10) / n; // n intervals, last index n, pred at n
      const toXY = (idx, val) => ({ x: 5 + idx * stepX, y: H - Math.max(0, Math.min(100, val)) / 100 * H });

      const plotSeries = (series, color) => {
        if (!Array.isArray(series) || !series.length) return;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        const f = toXY(0, series[0]); ctx.moveTo(f.x, f.y);
        for (let i = 1; i < series.length; i++) { const p = toXY(i, series[i]); ctx.lineTo(p.x, p.y); }
        ctx.stroke(); ctx.restore();
        // points
        ctx.save(); ctx.fillStyle = color;
        for (let i = 0; i < series.length; i++) { const p = toXY(i, series[i]); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
      };

      // Draw A and B
      plotSeries(sA, colA);
      plotSeries(sB, colB);

      // Predicted dashed segments and hollow points
      const drawPred = (series, pred, color) => {
        if (!Array.isArray(series) || !series.length || typeof pred !== 'number') return;
        const last = toXY(series.length-1, series[series.length-1]);
        const next = toXY(series.length, pred);
        ctx.save(); ctx.setLineDash([5,4]); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(next.x, next.y); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(next.x, next.y, 4, 0, Math.PI*2); ctx.stroke(); ctx.restore();
      };
      drawPred(sA, predA, colA);
      drawPred(sB, predB, colB);
    } catch (e) { console.warn('drawOverlaySuccessChart error', e); }
  }

  function fillSuccessCharts(d) {
    try {
      const sA = d?.playerA?.successSeries10;
      const sB = d?.playerB?.successSeries10;
      const predA = d?.predSuccessA11;
      const predB = d?.predSuccessB11;
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';

      const title = document.getElementById('succTitle');
      const nameElA = document.getElementById('succNameA');
      const nameElB = document.getElementById('succNameB');
      if (title) title.textContent = `Успешность — ${nameA} vs ${nameB}`;
      if (nameElA) nameElA.textContent = nameA;
      if (nameElB) nameElB.textContent = nameB;

      const canvas = document.getElementById('succChart');
      drawOverlaySuccessChart(canvas, sA, (typeof predA==='number'? predA: null), sB, (typeof predB==='number'? predB: null));

      // Probability annotation
      try {
        const pA = (typeof d?.predWinProbA === 'number') ? d.predWinProbA : null;
        const pB = (typeof d?.predWinProbB === 'number') ? d.predWinProbB : null;
        const el = document.getElementById('succProbLine');
        if (el && pA != null && pB != null) {
          el.textContent = `Прогноз победы: ${nameA} ${pA}% — ${nameB} ${pB}%`;
        } else if (el) {
          el.textContent = '';
        }
      } catch(_) {}
    } catch (e) { console.warn('fillSuccessCharts error', e); }
  }

  // Итоговый прогноз (beta) удалён по запросу: блок и логика сняты

  // === Decision Summary (мини-блок) + "Возьмёт минимум 2 сета" ===
  function fillDecisionSummary(d) {
  const cont = document.getElementById('decisionSummaryContainer');
  if (!cont) return;
  try {
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';
      const a10 = Number(d?.playerA?.nonBTProbability10 ?? d?.playerA?.nonBTProbability);
      const b10 = Number.isFinite(a10) ? (100 - a10) : NaN;
      const a5  = Number(d?.playerA?.nonBTProbability5);
      const b5  = Number.isFinite(a5)  ? (100 - a5)  : NaN;
      const a3  = Number(d?.playerA?.nonBTProbability3);
      const b3  = Number.isFinite(a3)  ? (100 - a3)  : NaN;
      const favIsA = (Number.isFinite(a10) && Number.isFinite(b10)) ? (a10 >= b10) : true;
      const fav = { p10: favIsA? a10 : b10, p5: favIsA? a5 : b5, p3: favIsA? a3 : b3 };
      const opp = { p10: favIsA? b10 : a10, p5: favIsA? b5 : a5, p3: favIsA? b3 : a3 };
      const favName = favIsA ? nameA : nameB;
      fav.d5_10 = (Number.isFinite(fav.p5) && Number.isFinite(fav.p10)) ? (fav.p5 - fav.p10) : -999;
      fav.d3_5  = (Number.isFinite(fav.p3) && Number.isFinite(fav.p5))  ? (fav.p3 - fav.p5)  : -999;

      // Logistic model window 3 (reuse simplified compute inline)
      const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
      const recA10 = Array.isArray(d?.recentsA10)? d.recentsA10 : [];
      const recB10 = Array.isArray(d?.recentsB10)? d.recentsB10 : [];
      const setsAvgDiffPerSet = (rec)=>{ let diff=0, sets=0; (rec||[]).forEach(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; s.forEach(([x,y])=>{ const a=+x||0, b=+y||0; diff += (a-b); sets++; }); }); return sets? (diff/sets) : 0; };
      const perMatchSetDiff = (rec)=> (rec||[]).map(m=>{ const s=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; let diff=0; s.forEach(([x,y])=>{ diff += ((+x||0) - (+y||0)); }); return s.length? (diff/s.length) : 0; });
      const emaArr = (arr,a)=>{ if(!arr.length) return 0; let s=arr[0]; for(let i=1;i<arr.length;i++) s=a*arr[i]+(1-a)*s; return s; };
      const slope3 = (arr)=>{ const L=arr.slice(0,3); const n=L.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=L[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; } const den=n*sxx-sx*sx; return den? (n*sxy - sx*sy)/den : 0; };
      const SstarA = Number(d?.playerA?.S_star), SstarB = Number(d?.playerB?.S_star);
      const EXT_A = Number(d?.playerA?.patterns?  ( (1-(d.playerA.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerA.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerA.patterns.tiebreak_losses?.rate||0))*20 + (d.playerA.patterns.decisive_fifth_wins?.rate||d.playerA.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const EXT_B = Number(d?.playerB?.patterns?  ( (1-(d.playerB.patterns.loss_after_2_1_obj?.rate||0))*30 + (1-(d.playerB.patterns.loss_after_two_set_run?.rate||0))*30 + (1-(d.playerB.patterns.tiebreak_losses?.rate||0))*20 + (d.playerB.patterns.decisive_fifth_wins?.rate||d.playerB.patterns.win_at_2_2?.rate||0)*20 ) : 0);
      const STAB_A = Number(d?.playerA?.stability||0)*100; const STAB_B = Number(d?.playerB?.stability||0)*100;
      const computeOut3 = ()=>{
        const A = recA10.slice(0,3), B = recB10.slice(0,3);
        const A_per = perMatchSetDiff(A), B_per = perMatchSetDiff(B);
        const F_short_A = emaArr(A_per.slice(0,5), 0.7);
        const F_short_B = emaArr(B_per.slice(0,5), 0.7);
        const Trend_A = slope3(A_per); const Trend_B = slope3(B_per);
        const dF = clamp(((F_short_A - F_short_B) + 0.5*(Trend_A - Trend_B)) / 6, -1, 1);
        let dS = (isFinite(SstarA)&&isFinite(SstarB))? ((SstarA - SstarB)/0.5) : 0; dS = clamp(dS, -1, 1);
        const A10 = setsAvgDiffPerSet(recA10), B10 = setsAvgDiffPerSet(recB10);
        const A5  = setsAvgDiffPerSet(recA10.slice(0,5)),  B5 = setsAvgDiffPerSet(recB10.slice(0,5));
        let baseD = 0.6*((A5-B5)) + 0.4*((A10-B10));
        const favA3 = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0);
        const hFav = favA3? (d?.h2hOrientedA||[]) : (d?.h2hOrientedB||[]);
        const lostK = (k)=>{ let c=0; for(let i=0;i<Math.min(k,hFav.length);i++){ const fo=hFav[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) c++; } return c===k; };
        let blow = 0; const PD3_A = (function(){ let s=0; for(const m of A){ const ss=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; for(const [x,y] of ss){ s += ((+x||0)-(+y||0)); } } return s; })();
        if (favA3){ if (PD3_A>=25) blow += 0.12; }
        if (lostK(2)) blow += 0.20; if (lostK(3)) blow += 0.35;
        let dD = clamp((baseD - blow)/4, -1, 1);
        const pairRates = (()=>{ let tb=0,sets=0,long=0,m=0; [A,B].forEach(arr=>{ arr.forEach(mm=>{ const s=Array.isArray(mm.setsOwnOpponent)? mm.setsOwnOpponent:[]; if(s.length){ m++; if(s.length>=4) long++; } s.forEach(([x,y])=>{ const aa=+x||0,bb=+y||0; if(aa>=10&&bb>=10) tb++; sets++; }); }); }); return { tb: (sets? tb/sets:0), long:(m? long/m:0) }; })();
        let dT_raw = 0.6*((EXT_A-EXT_B)/100) + 0.2*((STAB_A-STAB_B)/100) + 0.2*(pairRates.tb - 0.5) + 0.2*(pairRates.long - 0.5);
        if ((EXT_B - EXT_A) >= 12 && favA3) dT_raw -= 0.25; let dT = clamp(dT_raw/0.7, -1, 1);
        const z = 0 + 0.35*dF + 0.30*dS + 0.25*dD + 0.15*dT;
        let pFav = 1/(1+Math.exp(-z));
        if (lostK(2)) pFav = 1/(1+Math.exp(-(z-0.30)));
        if (lostK(3)) pFav = 1/(1+Math.exp(-(z-0.50)));
        const pA = favA3 ? pFav : (1-pFav);
        const pB = 1 - pA;
        return { pA, pB };
      };
      const ml3 = computeOut3();

      // Form (3): используем короткое окно без BT как приближение
      const form = { p3Fav: fav.p3 ?? 0, p3Opp: opp.p3 ?? 0 };

      // Base model and confidence
      const baseProb = (typeof d?.beta?.favoriteProb === 'number') ? Math.round(d.beta.favoriteProb*100) : (Number.isFinite(fav.p10)? Math.round(fav.p10) : 0);
      const confidence = Number(d?.beta?.confidence?.score || 0);

      // Conditions (pass + collect misses)
      const conditions = [];
      const misses = [];
      const fmt = (v)=>{
        const n = Number(v); if (!Number.isFinite(n)) return '—';
        const s = Math.round(n);
        return (s>=0? '+' : '') + s + '%';
      };
      const c1 = (baseProb >= 50);
      if (c1) conditions.push('✅ Модель подтверждает фаворита ≥ 50%');
      else misses.push('Модель < 50%');

      const c2 = ((fav.d5_10 ?? -999) >= -2) && ((fav.d3_5 ?? -999) >= 0);
      if (c2) conditions.push('✅ Δ(5−10) ≥ −2% и Δ(3−5) ≥ 0% (без BT)');
      else misses.push(`Тренд без BT: Δ(5−10) ${fmt(fav.d5_10)}; Δ(3−5) ${fmt(fav.d3_5)}`);

      const gapForm = ((form.p3Fav||0) - (form.p3Opp||0));
      const c3 = (gapForm >= 15);
      if (c3) conditions.push('✅ Форма (3) за фаворита ≥ 15%');
      else misses.push(`Форма (3) < 15% (разница ${fmt(gapForm)})`);

      const gapNB3 = ((fav.p3||0) - (opp.p3||0));
      const c4 = (gapNB3 >= 15);
      if (c4) conditions.push('✅ Вероятность (3, без BT) > на 15%');
      else misses.push(`Без BT (3) ≤ 15% (разница ${fmt(gapNB3)})`);

      const gapML3 = Math.round((ml3.pA*100) - (ml3.pB*100));
      const favMl3 = Math.max(ml3.pA, ml3.pB);
      const favMl3Pct = Math.round(favMl3 * 100);
      const c5 = (favMl3Pct > 55);
      if (c5) conditions.push('✅ Логистическая: Вероятность (3) > 55%');
      else misses.push(`Логистическая: Вероятность (3) ≤ 55% (fav ${favMl3Pct}%)`);

      const c6 = (confidence >= 60);
      if (c6) conditions.push('✅ Уверенность ≥ 60%');
      else misses.push('Уверенность < 60%');

      const score = (c1?1:0)+(c2?1:0)+(c3?1:0)+(c4?1:0)+(c5?1:0)+(c6?1:0);
      const keyCount = (c3?1:0) + (c4?1:0) + (c5?1:0);
      const index = Math.max(0, Math.min(1, 0.4*(score/6) + 0.6*(keyCount/3)));
      const indexPct = Math.round(index*100);
      const idxBand = index >= 0.75 ? 'высокий' : (index < 0.45 ? 'низкий' : 'средний');
      let verdict = '🟡 Осторожно — возможен апсет';
      let color = '#aa0';
      if (score >= 5 || index >= 0.75) { verdict = '🟢 Надёжно — высокая вероятность победы'; color = '#0a0'; }
      else if (score <= 2 || index < 0.45) { verdict = '🔴 Рисково — перевес слабый, фаворит уязвим'; color = '#a00'; }

      // Build an extra row with last up to 10 H2H games oriented relative to favorite
      let dsHtml = '';
      try {
        const games = Array.isArray(d?.h2h?.h2hGames) ? d.h2h.h2hGames.slice() : [];
        if (games.length) {
          // Sort by date desc if Date objects available
          games.sort((g1, g2) => {
            const t1 = (g1 && g1.date && g1.date.getTime) ? g1.date.getTime() : 0;
            const t2 = (g2 && g2.date && g2.date.getTime) ? g2.date.getTime() : 0;
            return t2 - t1;
          });
          const take = games.slice(0, 10);
          // Tokenize relative to favorite: 🟢 = win by favorite, 🔴 = loss by favorite
          const tokens = take.map(g => {
            const aWon = !!g.win; // win from A perspective
            const favWon = favIsA ? aWon : !aWon;
            return favWon ? '🟢' : '🔴';
          });
          const wins = tokens.filter(t => t === '🟢').length;
          const losses = tokens.length - wins;
          const dots = formatVisualization(tokens.join(' '));
          dsHtml = `
            <table class="mini-table" aria-label="H2H серия (последние 10, относительно фаворита)" style="margin-top:8px;">
              <tbody>
                <tr>
                  <td style="white-space:nowrap; width:1%;">(${wins}:${losses})</td>
                  <td>${dots}</td>
                </tr>
              </tbody>
            </table>
          `;
        }
      } catch (_) { /* ignore */ }

      // Min 2 sets block
      const opp_d5_10 = (Number.isFinite(opp.p5) && Number.isFinite(opp.p10)) ? (opp.p5 - opp.p10) : NaN;
      const passNoBt3 = gapNB3 >= 15;
      const passForm3 = gapForm >= 15;
      // Абсолютное условие для логистической (3): > 53% за фаворита
      const passMl3 = favMl3Pct > 53;
      const mlRed = gapML3 < 0;
      const matched = (passNoBt3?1:0) + (passForm3?1:0) + (passMl3?1:0);
      // Индекс силы и форма: фаворит по окну 10 должен иметь P(3) > 55%
      const favP3Val = Number(fav?.p3);
      const passIdxBlock = Number.isFinite(favP3Val) && favP3Val > 55;
      const shockOpp = (Number.isFinite(opp_d5_10) && opp_d5_10 >= 15) || (Number.isFinite(fav.d5_10) && fav.d5_10 <= -15);
      let v2 = 'Осторожно';
      let c2color = '#aa0';
      // Жёсткие условия: логистическая(3) > 53% И в блоке «Индекс силы и форма» у фаворита P(3) > 55%
      if (!passMl3 || !passIdxBlock || shockOpp || matched <= 1) { v2 = 'PASS'; c2color = '#a00'; }
      else if (matched >= 2 && mlRed) { v2 = 'Осторожно'; c2color = '#aa0'; }
      else if (matched >= 2 && !mlRed) { v2 = 'GO'; c2color = '#0a0'; }
      const sign = (x)=>{ const n=Math.round(Number(x)||0); return (Number.isFinite(n)? ((n>=0?'+':'')+n+'%') : '—'); };
      const fmt10 = (v)=>{ const n=Number(v); return Number.isFinite(n)? (Math.round(n)+'%'):'—'; };
      const favMl3Int_ = Number.isFinite(favMl3Pct) ? Math.round(favMl3Pct) : null;
      const favIdx3Int_ = Number.isFinite(favP3Val) ? Math.round(favP3Val) : null;
      const dataFav_ = String(favName || '').replace(/\"/g, '\\"');
      const dataLog3_ = favMl3Int_ != null ? ` data-log3="${favMl3Int_}"` : '';
      const dataIdx3_ = favIdx3Int_ != null ? ` data-idx3="${favIdx3Int_}"` : '';
      const min2Html = `
        <div class=\"take-two-sets\" style=\"background:${c2color};color:#fff;padding:8px 12px;border-radius:10px;font:600 13px/1.3 system-ui;margin-bottom:8px;\">
          <div style=\"font-size:14px;\">🔎 Решение: ${v2} | Совпадений: ${matched}/3</div>
          <div class=\"min2-extract\" data-fav=\"${dataFav_}\"${dataLog3_}${dataIdx3_} style=\"margin-top:6px;border-top:1px solid rgba(255,255,255,.35);padding-top:6px;\">
            <div>Фаворит ${favName}</div>
            <div>${favMl3Int_ != null ? favMl3Int_ + '%' : '—'}</div>
            <div>${favIdx3Int_ != null ? favIdx3Int_ + '%' : '—'}</div>
          </div>
        </div>
      `;

      cont.innerHTML = min2Html + dsHtml;
    } catch (e) {
      cont.textContent = '—';
      console.warn('DecisionSummary error', e);
    }
  }


  function setError(message, originForPerm) {
    loading.classList.add('hidden');
    if (error) {
      error.querySelector('p').textContent = message;
      error.classList.remove('hidden');
      const btn = document.getElementById('grantPermBtn');
      if (btn) {
        if (originForPerm) {
          btn.style.display = '';
          btn.onclick = async () => {
            try {
              const ok = await new Promise((resolve) => {
                if (!chrome.permissions || !chrome.permissions.request) return resolve(false);
                chrome.permissions.request({ origins: [originForPerm] }, (gr) => resolve(!!gr));
              });
              if (ok) {
                try {
                  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) chrome.tabs.reload(tabs[0].id);
                  });
                } catch(_) {}
                setTimeout(() => launchAnalyze(), 800);
              } else {
                setError('Доступ не предоставлен. Включите расширение для этого сайта.');
              }
            } catch (e) {
              setError('Ошибка запроса доступа: ' + (e?.message||e));
            }
          };
        } else {
          btn.style.display = 'none';
        }
      }
    }
  }

  function launchAnalyze() {
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    if (results) results.classList.add('hidden');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        setError('Не найдена активная вкладка.');
        return;
      }
      
      // Отправляем запрос контент‑скрипту без жесткой проверки URL — сам контент вернёт ошибку, если не на нужной странице
      const tab = tabs[0];

      chrome.tabs.sendMessage(tab.id, { action: 'analyze' }, async (response) => {
        loading.classList.add('hidden');
        
        // Улучшенная обработка ошибок соединения
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('Receiving end does not exist')) {
            try {
              const url = new URL(tab.url || '');
              const origin = url.origin + '/*';
              // 1) Попробуем ввести контент-скрипт принудительно (без перезагрузки)
              if (chrome.scripting && chrome.scripting.executeScript) {
                try {
                  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/meta-calibration.js'] });
                  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/bt-mm.js'] });
                  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/bradley-terry.js'] });
                  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/index.js'] });
                  // Повторный запрос после инъекции
                  setTimeout(() => launchAnalyze(), 200);
                  return;
                } catch (e) {
                  // Если сайт запрещает инъекцию — попросим доступ явно
                  setError('Для работы нужно разрешить доступ расширению на этом сайте.', origin);
                  return;
                }
              } else {
                setError('Для работы нужно разрешить доступ расширению на этом сайте.', origin);
                return;
              }
            } catch(_) {
              setError('Перезагрузите страницу и попробуйте снова');
            }
          } else {
            setError('Ошибка соединения: ' + errorMsg);
          }
          return;
        }
        
        try {
          if (!response || !response.success) {
            throw new Error((response && response.error) || 'Ошибка анализа данных');
          }
          const d = response.data;
          // Decision summary first
          try { fillDecisionSummary(d); } catch(e) { console.warn('fillDecisionSummary error', e); }
          // Minimal forecast block next
          try { fillMinimalForecast(d); } catch(e) { console.warn('minimal-forecast render failed', e); }
          // Restore full UI fills
          try { fillTop3Tables(d); } catch(e) { console.warn('fillTop3Tables error', e); }
          try { fillMainTable(d); } catch(e) { console.warn('fillMainTable error', e); }
          try { fillStatsTables(d); } catch(e) { console.warn('fillStatsTables error', e); }
          try { fillNonBTProbability(d); } catch(e) { console.warn('fillNonBTProbability error', e); }
          try { fillVisualization(d); } catch(e) { console.warn('fillVisualization error', e); }
          try { fillSetsTable(d); } catch(e) { console.warn('fillSetsTable error', e); }
          try { fillPatternsTable(d); } catch(e) { console.warn('fillPatternsTable error', e); }
          try { fillCommonOpponents(d); } catch(e) { console.warn('fillCommonOpponents error', e); }
          try { fillSuccessCharts(d); } catch(e) { console.warn('fillSuccessCharts error', e); }
          try { fillConsensus(d); } catch(e) { console.warn('fillConsensus error', e); }
          try { fillFinalForecast(d); } catch(e) { /* may be removed; ignore */ }
          try { fillModelForecast(d); } catch(e) { /* may be removed; ignore */ }
          try { fillStrengthIndex(d); } catch(e) { console.warn('fillStrengthIndex error', e); }
          try { if (typeof window.fillFavRules === 'function') window.fillFavRules(d); else fillFavRules(d); } catch(e) { console.warn('fillFavRules error', e); }
          try { if (typeof window.fillTB35 === 'function') window.fillTB35(d); } catch(e) { console.warn('fillTB35 error', e); }
          try { applyHelpTitles(); } catch(e) {}
          if(results) results.classList.remove('hidden');
          try { fillDecisionQuick(d); } catch(e) { console.warn('fillDecisionQuick error', e); }
        } catch (e) {
          setError('Ошибка: ' + e.message);
        }
      });
    });
  }

  // end: normal UI flow restored

  // Lightweight decision block (3 keys) for summary card
  function fillDecisionQuick(d){
    const cont = document.getElementById('decisionSummaryContainer');
    if (!cont) return;
    try {
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';
      const a10 = Number(d?.playerA?.nonBTProbability10 ?? d?.playerA?.nonBTProbability);
      const b10 = Number(d?.playerB?.nonBTProbability10 ?? d?.playerB?.nonBTProbability);
      const a5  = Number(d?.playerA?.nonBTProbability5);
      const b5  = Number(d?.playerB?.nonBTProbability5);
      const a3  = Number(d?.playerA?.nonBTProbability3);
      const b3  = Number(d?.playerB?.nonBTProbability3);
      const favIsA = (Number.isFinite(a10) && Number.isFinite(b10)) ? (a10 >= b10) : true;
      const favName = favIsA ? nameA : nameB;
      const nb3Fav = favIsA ? a3 : b3;
      const nb3Opp = favIsA ? b3 : a3;
      const gapNB3 = (Number.isFinite(nb3Fav) && Number.isFinite(nb3Opp)) ? (nb3Fav - nb3Opp) : NaN;
      const gapForm = gapNB3; // приближение формы(3) через non-BT(3)

      // Logistic(3) — вычисляем тем же методом, что и в таблице «Прогноз (логистическая модель)»
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
      const computeForWindow3 = (recA, recB)=>{
        const A = recA, B = recB;
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
        const PD5_A  = Number(d?.playerA?.pointsSummary5?.diff)||0;
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
        return { pA, pB: 1-pA, favA: favA3 };
      };
      const out3 = computeForWindow3(recA10.slice(0,3), recB10.slice(0,3));
      const favMl3Pct = (favIsA ? out3.pA : out3.pB) * 100;
      const ml3Diff = NaN; // дифф не используем в коротком формате

      const passNoBt3 = Number.isFinite(gapNB3) && gapNB3 >= 15;
      const passForm3 = Number.isFinite(gapForm) && gapForm >= 15;
      const passMl3   = Number.isFinite(favMl3Pct) && favMl3Pct > 53; // >53% обязательное

      // Индекс силы/форма (10): P(3) у фаворита >55%
      const favP3 = favIsA ? a3 : b3;
      const passIdx = Number.isFinite(favP3) && favP3 > 55;

      const matched = (passNoBt3?1:0)+(passForm3?1:0)+(passMl3?1:0);
      let v2 = 'Осторожно';
      let color = '#aa0';
      if (!passMl3 || !passIdx || matched <= 1) { v2='PASS'; color='#a00'; }
      else if (matched >= 2) { v2='GO'; color='#0a0'; }

      const sign = (x)=>{ const n=Math.round(Number(x)||0); return (Number.isFinite(n)? ((n>=0?'+':'')+n+'%') : '—'); };
      const fmtPct = (x)=> Number.isFinite(x)? (Math.round(x)+'%') : '—';
      const fmt10 = (x)=> Number.isFinite(x)? (Math.round(x)+'%') : '—';

      const favMl3Int = Number.isFinite(favMl3Pct) ? Math.round(favMl3Pct) : null;
      const favIdx3Int = Number.isFinite(favP3) ? Math.round(favP3) : null;
      const dataFav = String(favName || '').replace(/\"/g, '\\"');
      const dataLog3 = favMl3Int != null ? ` data-log3="${favMl3Int}"` : '';
      const dataIdx3 = favIdx3Int != null ? ` data-idx3="${favIdx3Int}"` : '';

      const html = `
        <div class=\"take-two-sets\" style=\"background:${color};color:#fff;padding:8px 12px;border-radius:10px;font:600 13px/1.3 system-ui;margin-bottom:8px;\">
          <div style=\"font-size:14px;\">🔎 Решение: ${v2} | Совпадений: ${matched}/3</div>
          <div class=\"min2-extract\" data-fav=\"${dataFav}\"${dataLog3}${dataIdx3} style=\"margin-top:6px;border-top:1px solid rgba(255,255,255,.35);padding-top:6px;\">
            <div>Фаворит ${favName}</div>
            <div>${favMl3Int != null ? favMl3Int + '%' : '—'}</div>
            <div>${favIdx3Int != null ? favIdx3Int + '%' : '—'}</div>
          </div>
        </div>`;
      cont.innerHTML = html;
    } catch(e){ cont.textContent = '—'; }
  }

  // ---- Индекс силы матча и форма ----
  function fillStrengthIndex(d){
    try{
      // New minimal calculation: use new F/S* logic from content/index.js
      try {
        const nameA = d?.playerA?.name || 'Игрок 1';
        const nameB = d?.playerB?.name || 'Игрок 2';
        const elNameA = document.getElementById('siNameA'); if (elNameA) elNameA.textContent = nameA;
        const elNameB = document.getElementById('siNameB'); if (elNameB) elNameB.textContent = nameB;
        let pA = (typeof d?.winProbNewA === 'number') ? d.winProbNewA : null;
        if (pA == null) {
          const fA = d?.playerA?.F_final, fB = d?.playerB?.F_final;
          const sA = d?.playerA?.S_star,  sB = d?.playerB?.S_star;
          if (typeof fA==='number' && typeof fB==='number' && typeof sA==='number' && typeof sB==='number'){
            const z = 0 + 2.3*(fA-fB) + 1.7*(sA-sB);
            pA = 1/(1+Math.exp(-z));
          } else { pA = 0.5; }
        }
        // Additionally show windowed NB probabilities (10/5/3)
        const toPct = (v)=> (typeof v==='number' && !isNaN(v) ? Math.round(v) + '%' : '—');
        const a10 = Number(d?.playerA?.nonBTProbability10 ?? d?.playerA?.nonBTProbability);
        const b10 = isNaN(a10) ? NaN : (100 - a10);
        const a5  = Number(d?.playerA?.nonBTProbability5);
        const b5  = isNaN(a5) ? NaN : (100 - a5);
        const a3  = Number(d?.playerA?.nonBTProbability3);
        const b3  = isNaN(a3) ? NaN : (100 - a3);
        const p10AEl = document.getElementById('siProb10A'); if (p10AEl) p10AEl.textContent = toPct(a10);
        const p10BEl = document.getElementById('siProb10B'); if (p10BEl) p10BEl.textContent = toPct(b10);
        const p5AEl  = document.getElementById('siProb5A');  if (p5AEl)  p5AEl.textContent  = toPct(a5);
        const p5BEl  = document.getElementById('siProb5B');  if (p5BEl)  p5BEl.textContent  = toPct(b5);
        const p3AEl  = document.getElementById('siProb3A');  if (p3AEl)  p3AEl.textContent  = toPct(a3);
        const p3BEl  = document.getElementById('siProb3B');  if (p3BEl)  p3BEl.textContent  = toPct(b3);
        // Per-window highlighting: green only if leader > 55%
        const applyWindowHL = (aVal, bVal, aEl, bEl) => {
          if (!aEl || !bEl) return;
          resetHL(aEl); resetHL(bEl);
          const aOk = Number.isFinite(aVal); const bOk = Number.isFinite(bVal);
          if (!aOk || !bOk) return;
          const aIsFav = aVal >= bVal;
          const leadPct = (aIsFav ? aVal : bVal) / 100;
          if (leadPct > 0.55) applyTier(aIsFav ? aEl : bEl, 'good');
        };
        applyWindowHL(a10, b10, p10AEl, p10BEl);
        applyWindowHL(a5,  b5,  p5AEl,  p5BEl);
        applyWindowHL(a3,  b3,  p3AEl,  p3BEl);
        return; // skip legacy rendering below
      } catch(_) {}
      const nameA = d?.playerA?.name || 'Игрок 1';
      const nameB = d?.playerB?.name || 'Игрок 2';
      const elNameA = document.getElementById('siNameA'); if (elNameA) elNameA.textContent = nameA;
      const elNameB = document.getElementById('siNameB'); if (elNameB) elNameB.textContent = nameB;
      const legA = document.getElementById('formLegendA'); if (legA) legA.textContent = nameA;
      const legB = document.getElementById('formLegendB'); if (legB) legB.textContent = nameB;

      // Helpers
      const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
      const parseMatches = (arr) => Array.isArray(arr) ? arr.filter(m=>Array.isArray(m.setsOwnOpponent) && m.setsOwnOpponent.length) : [];
      const matchIndex = (m) => {
        const sets = Array.isArray(m.setsOwnOpponent) ? m.setsOwnOpponent : [];
        let setsFor=0, setsAgainst=0, ptsFor=0, ptsAgainst=0;
        for (const [a,b] of sets){ const aa=Number(a)||0, bb=Number(b)||0; if(aa>bb) setsFor++; else if(bb>aa) setsAgainst++; ptsFor+=aa; ptsAgainst+=bb; }
        const totalSets = setsFor + setsAgainst; if (totalSets<=0) return 0;
        const S_set = clamp((setsFor - setsAgainst)/3, -1, 1);
        const nSets = sets.length || 1; const S_pts = clamp(((ptsFor - ptsAgainst)/11)/nSets, -1, 1);
        let S_dec = 0.0; if (nSets === 5){ const won = setsFor>setsAgainst; S_dec = won? +0.15 : -0.15; }
        const I = 0.55*S_set + 0.30*S_pts + 0.15*S_dec;
        return clamp(I, -1, 1);
      };
      const toSeries = (arr10) => parseMatches(arr10).slice(0,10).map(matchIndex);
      const ema = (vals, alpha=0.4) => { if(!vals.length) return 0; let s=vals[0]; for(let i=1;i<vals.length;i++){ s = alpha*vals[i] + (1-alpha)*s; } return s; };
      const trendSlope = (vals) => {
        const n = vals.length; if (n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=vals[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; }
        const denom = n*sxx - sx*sx; if (!denom) return 0; const a = (n*sxy - sx*sy)/denom; return a; // ~ per game step
      };
      const avg = (vals) => vals.length? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
      const probFromDelta = (dlt, k=4.0) => 1/(1+Math.exp(-k*dlt));

      const recA10 = d?.recentsA10 || [];
      const recB10 = d?.recentsB10 || [];
      const h2hA = d?.h2hOrientedA || [];
      const h2hB = d?.h2hOrientedB || [];

      const seriesA = toSeries(recA10);
      const seriesB = toSeries(recB10);
      const F_A = ema(seriesA, 0.4) + 0.3*trendSlope(seriesA);
      const F_B = ema(seriesB, 0.4) + 0.3*trendSlope(seriesB);
      const H_A = 0.20 * avg(parseMatches(h2hA).map(matchIndex));
      const H_B = 0.20 * avg(parseMatches(h2hB).map(matchIndex));
      const S_A = clamp(F_A + (isFinite(H_A)?H_A:0), -1, 1);
      const S_B = clamp(F_B + (isFinite(H_B)?H_B:0), -1, 1);
      const pA = probFromDelta(S_A - S_B, 4.0);

      const fmt = (x) => (x==null||Number.isNaN(x))? '—' : (x>0?'+':'') + (Math.round(x*100)/100).toFixed(2);
      const pct = (p) => (p==null? '—' : Math.round(p*100) + '%');

      const formAEl = document.getElementById('siFormA'); if (formAEl) formAEl.textContent = fmt(F_A);
      const formBEl = document.getElementById('siFormB'); if (formBEl) formBEl.textContent = fmt(F_B);
      const hAEl = document.getElementById('siH2HA'); if (hAEl) hAEl.textContent = fmt(H_A);
      const hBEl = document.getElementById('siH2HB'); if (hBEl) hBEl.textContent = fmt(H_B);
      const sAEl = document.getElementById('siForecastA'); if (sAEl) sAEl.textContent = fmt(S_A);
      const sBEl = document.getElementById('siForecastB'); if (sBEl) sBEl.textContent = fmt(S_B);
      const pAEl = document.getElementById('siProbA'); if (pAEl) pAEl.textContent = pct(pA);
      const pBEl = document.getElementById('siProbB'); if (pBEl) pBEl.textContent = pct(1-pA);

      // Simple SVG chart
      try{
        const svg = document.getElementById('formChart');
        if (svg){
          const W = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : (svg.getAttribute('width')? Number(svg.getAttribute('width')):760);
          const H = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height ? svg.viewBox.baseVal.height : (svg.getAttribute('height')? Number(svg.getAttribute('height')):180);
          const n = Math.max(seriesA.length, seriesB.length);
          const padL = 36, padR = 16, padT = 14, padB = 22;
          const plotW = W - padL - padR; const plotH = H - padT - padB;
          const x = (i)=> padL + (n>1? (plotW*(i/(n-1))) : plotW/2);
          const y = (v)=> padT + plotH*(1 - ((v+1)/2)); // map [-1,1] → [H-pad, pad]

          // Grid lines and axis labels
          svg.innerHTML = '';
          const gridVals = [-1,-0.5,0,0.5,1];
          gridVals.forEach(gv => {
            const gy = y(gv);
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1', padL); line.setAttribute('x2', W-padR);
            line.setAttribute('y1', gy); line.setAttribute('y2', gy);
            line.setAttribute('stroke', gv===0? '#94a3b8' : '#1f2937');
            line.setAttribute('stroke-width', gv===0? '1.5' : '1');
            line.setAttribute('opacity', gv===0? '0.7' : '0.35');
            svg.appendChild(line);
            const label = document.createElementNS('http://www.w3.org/2000/svg','text');
            label.setAttribute('x', 6);
            label.setAttribute('y', gy+4);
            label.setAttribute('fill', '#94a3b8');
            label.setAttribute('font-size', '11');
            label.textContent = (gv>0?'+':'') + gv.toFixed(1);
            svg.appendChild(label);
          });

          const toPath = (vals)=>{
            if (!vals.length) return '';
            const pts = vals.map((v,i)=> `${i===0?'M':'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
            return pts;
          };
          svg.innerHTML = '';
          // redraw grid and labels after clear
          gridVals.forEach(gv => {
            const gy = y(gv);
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1', padL); line.setAttribute('x2', W-padR);
            line.setAttribute('y1', gy); line.setAttribute('y2', gy);
            line.setAttribute('stroke', gv===0? '#94a3b8' : '#1f2937');
            line.setAttribute('stroke-width', gv===0? '1.5' : '1');
            line.setAttribute('opacity', gv===0? '0.7' : '0.35');
            svg.appendChild(line);
            const label = document.createElementNS('http://www.w3.org/2000/svg','text');
            label.setAttribute('x', 6);
            label.setAttribute('y', gy+4);
            label.setAttribute('fill', '#94a3b8');
            label.setAttribute('font-size', '11');
            label.textContent = (gv>0?'+':'') + gv.toFixed(1);
            svg.appendChild(label);
          });

          // series (favor thicker)
          const favA = S_A >= S_B;
          const strokeA = favA ? 3.5 : 2;
          const strokeB = favA ? 2 : 3.5;
          const pAPath = document.createElementNS('http://www.w3.org/2000/svg','path'); pAPath.setAttribute('d', toPath(seriesA)); pAPath.setAttribute('stroke','#22c55e'); pAPath.setAttribute('fill','none'); pAPath.setAttribute('stroke-width', String(strokeA)); pAPath.setAttribute('stroke-linecap','round'); svg.appendChild(pAPath);
          const pBPath = document.createElementNS('http://www.w3.org/2000/svg','path'); pBPath.setAttribute('d', toPath(seriesB)); pBPath.setAttribute('stroke','#ef4444'); pBPath.setAttribute('fill','none'); pBPath.setAttribute('stroke-width', String(strokeB)); pBPath.setAttribute('stroke-linecap','round'); svg.appendChild(pBPath);

          // point markers
          const drawDots = (vals, color) => {
            vals.forEach((v,i)=>{
              const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
              c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.setAttribute('r', '2.5'); c.setAttribute('fill', color);
              c.setAttribute('opacity','0.9'); svg.appendChild(c);
            });
          };
          drawDots(seriesA, '#22c55e');
          drawDots(seriesB, '#ef4444');
          // forecast markers at x=n (virtual 11th point) + inline labels
          const xNext = x(Math.max(0,n-1));
          const mA = document.createElementNS('http://www.w3.org/2000/svg','circle'); mA.setAttribute('cx', xNext); mA.setAttribute('cy', y(S_A)); mA.setAttribute('r','3.5'); mA.setAttribute('fill','#22c55e'); svg.appendChild(mA);
          const mB = document.createElementNS('http://www.w3.org/2000/svg','circle'); mB.setAttribute('cx', xNext); mB.setAttribute('cy', y(S_B)); mB.setAttribute('r','3.5'); mB.setAttribute('fill','#ef4444'); svg.appendChild(mB);
          const makeLabel = (x0, y0, text, color) => {
            const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
            txt.setAttribute('x', x0 + 8); txt.setAttribute('y', y0 + 4);
            txt.setAttribute('fill', color); txt.setAttribute('font-size','12'); txt.setAttribute('font-weight','600');
            txt.textContent = text;
            // simple background box (estimate width)
            const estW = Math.max(36, text.length*7);
            const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
            rect.setAttribute('x', x0 + 6); rect.setAttribute('y', y0 - 10);
            rect.setAttribute('width', String(estW)); rect.setAttribute('height','16');
            rect.setAttribute('rx','3'); rect.setAttribute('fill','rgba(0,0,0,0.35)');
            svg.appendChild(rect);
            svg.appendChild(txt);
          };
          makeLabel(xNext, y(S_A), nameA, '#22c55e');
          makeLabel(xNext, y(S_B), nameB, '#ef4444');
        }
      }catch(_){ }
    } catch(e){ /* silent */ }
  }

  // === Правила победы фаворита ===
  function fillFavRules(d){
    try {
      const body = document.getElementById('favRulesBody');
      const sumEl = document.getElementById('favRulesSummary');
      if (!body || !sumEl) return;

      // Helpers
      const clamp = (x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
      const clamp01 = (x)=>clamp(x,0,1);
      const logit = (p)=>{ const pp = Math.max(1e-6, Math.min(1-1e-6, clamp01(p||0.5))); return Math.log(pp/(1-pp)); };
      const invLogit = (z)=>1/(1+Math.exp(-z));
      const pct = (p)=> (p==null? '—' : `${Math.round(p*100)}%`);
      const z2unit = (x, min, max) => { const a=Number(min)||0, b=Number(max)||1; if (b<=a) return 0; return Math.max(0, Math.min(1, ((Number(x)||0) - a)/(b-a) )); };
      const stepUp = (x, from, to) => z2unit(x, from, to);
      const stepDown = (x, from, to) => 1 - z2unit(x, from, to);
      const sgnBool = (cond) => cond ? 1 : 0;

      // Base inputs as in consensus fallback
      const strengthA = parseFloat(d.playerA?.mainStrength ?? d.playerA?.strength ?? 0) || 0;
      const strengthB = parseFloat(d.playerB?.mainStrength ?? d.playerB?.strength ?? 0) || 0;
      const stabilityA = parseFloat(d.playerA?.stability ?? 0) || 0;
      const stabilityB = parseFloat(d.playerB?.stability ?? 0) || 0;
      const gamesTodayA = Number(d.playerA?.matchesToday?.total || 0);
      const gamesTodayB = Number(d.playerB?.matchesToday?.total || 0);
      const pBT_A_raw = (typeof d.bt_p_match === 'number') ? d.bt_p_match : 0.5;
      const pBT_A = Math.max(0.18, Math.min(0.82, pBT_A_raw));
      let h2h_sets_A = 0, h2h_sets_B = 0, h2h_set3_A = 0, h2h_set3_B = 0;
      try {
        const det = d?.h2h?.setWins?.detailed;
        if (det?.summary) { h2h_sets_A = Number(det.summary.playerAWins || 0); h2h_sets_B = Number(det.summary.playerBWins || 0); }
        if (det?.playerA?.set3 && det?.playerB?.set3) { h2h_set3_A = Number(det.playerA.set3.win || 0); h2h_set3_B = Number(det.playerB.set3.win || 0); }
      } catch(_){}
      const tbAobj = d?.playerA?.patterns?.tiebreak_losses;
      const tbBobj = d?.playerB?.patterns?.tiebreak_losses;
      const tb_lose_A = (tbAobj && typeof tbAobj.rate === 'number') ? tbAobj.rate : 0.5;
      const tb_lose_B = (tbBobj && typeof tbBobj.rate === 'number') ? tbBobj.rate : 0.5;
      const p5_base = (typeof d?.decider?.p5_no_h2h === 'number') ? d.decider.p5_no_h2h
                      : (typeof d?.decider?.empP5 === 'number') ? d.decider.empP5 : 0;
      const Eff = (S, stab, g) => { const s01 = stab>1?stab/100:stab; const fat=Math.max(0,1-0.04*Math.max(0,(g||0)-2)); return clamp(S*(0.6+0.4*s01)*fat,0,100); };
      const EffA = Eff(strengthA, stabilityA, gamesTodayA); const EffB = Eff(strengthB, stabilityB, gamesTodayB);
      const eff_gap = clamp((EffA-EffB)/100,-1,1);
      const stab_gap = clamp(((stabilityA>1?stabilityA/100:stabilityA) - (stabilityB>1?stabilityB/100:stabilityB)),-1,1);
      const btZ = logit(pBT_A);
      const h2h_sets_gap = (h2h_sets_A+h2h_sets_B)>0 ? clamp((h2h_sets_A-h2h_sets_B)/(h2h_sets_A+h2h_sets_B),-1,1) : 0;
      const s3A = h2h_set3_A, s3B = h2h_set3_B;
      const set3_edge = (s3A+s3B)>0 ? clamp((s3A-s3B)/(s3A+s3B),-1,1) : 0;
      const tbA = clamp01(tb_lose_A), tbB = clamp01(tb_lose_B);
      const tb_edge = clamp(((1-tbA)-(1-tbB)),-1,1);
      const p5 = clamp01(p5_base||0);
      const z = (1.0*btZ) + (0.80*eff_gap) + (0.90*stab_gap) + (0.75*h2h_sets_gap) + (0.45*set3_edge*(1-p5)) + (0.35*tb_edge*p5);
      const pCons = invLogit(z);
      const isAFav = pCons >= 0.5;
      const favName = isAFav ? (d?.playerA?.name||'A') : (d?.playerB?.name||'B');

      // EXT по новой спецификации (только паттерны) — 0..100
      const getRate = (obj, {preferLoss=false}={}) => {
        if (!obj) return 0.5;
        if (typeof obj.rate === 'number') return clamp01(obj.rate);
        const total = Number(obj.total||0);
        if (total<=0) return 0.5;
        const wins = Number(preferLoss ? obj.losses||0 : obj.wins||0);
        return clamp01(wins/Math.max(1,total));
      };
      const computeExtPct = (pat) => {
        const C1 = 1 - getRate(pat?.loss_after_2_1_obj, {preferLoss:true});
        const C2 = 1 - getRate(pat?.loss_after_two_set_run, {preferLoss:true});
        const C3 = 1 - getRate(pat?.tiebreak_losses, {preferLoss:true});
        const C4 = getRate(pat?.decisive_fifth_wins ?? pat?.win_at_2_2);
        const ext = (0.30*C1 + 0.30*C2 + 0.20*C3 + 0.20*C4) * 100;
        return Math.round(ext);
      };
      const extA = computeExtPct(d.playerA.patterns || {});
      const extB = computeExtPct(d.playerB.patterns || {});
      const extFav = isAFav ? extA : extB;

      // Non-BT
      const nbA = (typeof d.playerA?.nonBTProbability === 'number') ? d.playerA.nonBTProbability : null;
      const nbB = (typeof d.playerB?.nonBTProbability === 'number') ? d.playerB.nonBTProbability : null;
      const nbFavPct = isAFav ? nbA : nbB;
      const nbOppPct = isAFav ? nbB : nbA;
      const nbFav = (nbFavPct!=null)? (Number(nbFavPct)/100) : null;
      const nbFavSide = (nbA!=null && nbB!=null) ? (nbA>=nbB? 'A':'B') : null;
      const btFavName = (typeof d.bt_favorite === 'string') ? d.bt_favorite : ((typeof d.bt_p_match === 'number') ? (d.bt_p_match>=0.5? d.playerA.name : d.playerB.name) : null);
      const btSide = btFavName ? (btFavName===d.playerA.name? 'A':'B') : null;

      // BT consensus across up to 3 sources
      const favIsA = isAFav; // orientation of favorite used in this block
      const toNum = (x) => (typeof x === 'number' ? x : parseFloat(String(x).replace('%',''))/100);
      const favWinSumFromScores = (list) => {
        if (!Array.isArray(list)) return null;
        const pick = new Set(favIsA ? ['3:0','3:1','3:2'] : ['0:3','1:3','2:3']);
        let s = 0, n = 0;
        for (const it of list) {
          const sc = String(it.score||'');
          const p = toNum(it.probability ?? it.label);
          if (isFinite(p)) { n++; if (pick.has(sc)) s += p; }
        }
        return n>0 ? Math.max(0, Math.min(1, s)) : null;
      };
      const btSupport = [];
      if (pBT_A_raw!=null) btSupport.push(favIsA ? (pBT_A_raw>=0.5) : (pBT_A_raw<0.5));
      if (Array.isArray(d.btScoreProbs)) {
        const ps = favWinSumFromScores(d.btScoreProbs);
        if (ps!=null) btSupport.push(ps>=0.50);
      } else if (Array.isArray(d?.bt?.top3) || Array.isArray(d?.bt?.dist)) {
        const arr = Array.isArray(d.bt.dist) ? Object.entries(d.bt.dist).map(([score,probability])=>({score,probability})) : d.bt.top3;
        const ps = favWinSumFromScores(arr);
        if (ps!=null) btSupport.push(ps>=0.50);
      }
      if (Array.isArray(d.btOldScoreProbs)) {
        const ps = favWinSumFromScores(d.btOldScoreProbs);
        if (ps!=null) btSupport.push(ps>=0.50);
      } else if (Array.isArray(d.predictedScores)) {
        const ps = favWinSumFromScores(d.predictedScores);
        if (ps!=null) btSupport.push(ps>=0.50);
      }
      // Cap to 3 sources max
      if (btSupport.length > 3) btSupport.length = 3;
      const favVotes = btSupport.filter(Boolean).length;
      const totalVotes = btSupport.length;
      const plusBT = (votes)=>{ if(votes===3) return 0.14; if(votes===2) return 0.08; if(votes===1) return 0.03; return 0; };
      const penBT = (votes)=> (votes===0 && totalVotes===3 ? 0.05 : 0);

      // Logistic model prob on favorite side
      const pLogA = (typeof d?.forecast?.pA === 'number') ? d.forecast.pA : null;
      const pLogFav = (pLogA!=null) ? (isAFav ? pLogA : (1 - pLogA)) : null;

      // Strength Index prob (10 games) on favorite side (recompute)
      const parseMatches = (arr) => Array.isArray(arr) ? arr.filter(m=>Array.isArray(m.setsOwnOpponent) && m.setsOwnOpponent.length) : [];
      const matchIndex = (m) => { const sets=Array.isArray(m.setsOwnOpponent)?m.setsOwnOpponent:[]; let setsFor=0,setsAgainst=0,ptsFor=0,ptsAgainst=0; for(const [a,b] of sets){ const aa=Number(a)||0, bb=Number(b)||0; if(aa>bb) setsFor++; else if(bb>aa) setsAgainst++; ptsFor+=aa; ptsAgainst+=bb; } const totalSets=setsFor+setsAgainst; if(totalSets<=0) return 0; const S_set=clamp((setsFor-setsAgainst)/3,-1,1); const nSets=sets.length||1; const S_pts=clamp(((ptsFor-ptsAgainst)/11)/nSets,-1,1); let S_dec=0.0; if(nSets===5){ const won=setsFor>setsAgainst; S_dec=won?+0.15:-0.15; } const I=0.55*S_set+0.30*S_pts+0.15*S_dec; return clamp(I,-1,1); };
      const toSeries = (arr10) => parseMatches(arr10).slice(0,10).map(matchIndex);
      const ema = (vals, alpha=0.4) => { if(!vals.length) return 0; let s=vals[0]; for(let i=1;i<vals.length;i++){ s = alpha*vals[i] + (1-alpha)*s; } return s; };
      const trendSlope = (vals) => { const n=vals.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=vals[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x;} const denom=n*sxx - sx*sx; if(!denom) return 0; return (n*sxy - sx*sy)/denom; };
      const avg = (vals)=> vals.length? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
      const probFromDelta = (dlt,k=4.0)=> 1/(1+Math.exp(-k*dlt));
      const recA10 = d?.recentsA10 || []; const recB10 = d?.recentsB10 || [];
      const h2hA = d?.h2hOrientedA || []; const h2hB = d?.h2hOrientedB || [];
      const seriesA = toSeries(recA10); const seriesB = toSeries(recB10);
      const F_A = ema(seriesA, 0.4) + 0.3*trendSlope(seriesA);
      const F_B = ema(seriesB, 0.4) + 0.3*trendSlope(seriesB);
      const H_A = 0.20 * avg(parseMatches(h2hA).map(matchIndex));
      const H_B = 0.20 * avg(parseMatches(h2hB).map(matchIndex));
      const S_A = clamp(F_A + (isFinite(H_A)?H_A:0), -1, 1);
      const S_B = clamp(F_B + (isFinite(H_B)?H_B:0), -1, 1);
      const pIdxA = probFromDelta(S_A - S_B, 4.0);
      const pIdxFav = isAFav ? pIdxA : (1 - pIdxA);

      // (old contribution-based scoring removed)

      // NEW scoring per spec
      const del = d?.forecast?.deltas || {};
      const sumFS = ['dF','dS','dD','dT'].map(k=>Number(del[k]||0)).reduce((a,b)=>a+(isFinite(b)?b:0),0);
      const btStrength = (totalVotes>0) ? (favVotes/totalVotes) : 0;
      const btAgree = favVotes>0;
      const stabFavPct = (isAFav? (stabilityA<=1?stabilityA*100:stabilityA) : (stabilityB<=1?stabilityB*100:stabilityB));
      const stabUndPct = (isAFav? (stabilityB<=1?stabilityB*100:stabilityB) : (stabilityA<=1?stabilityA*100:stabilityA));
      const deltaStab = stabFavPct - stabUndPct;

      const rateFrom = (obj, preferLoss=false) => {
        if (!obj) return null;
        if (typeof obj.rate === 'number') return clamp01(obj.rate);
        const t = Number(obj.total||0); if (t<=0) return null;
        const w = Number(preferLoss? obj.losses||0 : obj.wins||0);
        return clamp01(w/Math.max(1,t));
      };
      const patFav = isAFav ? (d.playerA.patterns||{}) : (d.playerB.patterns||{});
      const patDog = isAFav ? (d.playerB.patterns||{}) : (d.playerA.patterns||{});
      const r1Fav = rateFrom(patFav.tiebreak_losses, true);
      const r2Fav = rateFrom(patFav.loss_after_2_1_obj, true);
      const r4Fav = (function(){ const w=rateFrom(patFav.decisive_fifth_wins||patFav.win_at_2_2,false); return (w==null? null : (1-w)); })();
      const r5Fav = rateFrom(patFav.win_after_1_2, false);
      const r1Dog = rateFrom(patDog.tiebreak_losses, true);
      const r2Dog = rateFrom(patDog.loss_after_2_1_obj, true);
      const r4Dog = (function(){ const w=rateFrom(patDog.decisive_fifth_wins||patDog.win_at_2_2,false); return (w==null? null : (1-w)); })();
      const r5Dog = rateFrom(patDog.win_after_1_2, false);
      const oneMinus = (x)=> (x==null? null : (1-x));
      const extProFav = Math.round(clamp01(0.45*(oneMinus(r1Fav)??0.5) + 0.25*(oneMinus(r4Fav)??0.5) + 0.20*(r5Fav??0.5) + 0.10*(1-(r2Fav??0.5))) * 100);
      const extProDog = Math.round(clamp01(0.45*(oneMinus(r1Dog)??0.5) + 0.25*(oneMinus(r4Dog)??0.5) + 0.20*(r5Dog??0.5) + 0.10*(1-(r2Dog??0.5))) * 100);

      // Common opponents aggregation
      const rows = Array.isArray(d.commonOpponents) ? d.commonOpponents : [];
      const favSideChar = isAFav ? 'A':'B';
      let gamesCO = 0, marginSets = 0, marginPoints = 0;
      for (const r of rows) {
        gamesCO++;
        const aSetDiff = (Number(r?.a?.setsWon||0) - Number(r?.a?.setsLost||0));
        const bSetDiff = (Number(r?.b?.setsWon||0) - Number(r?.b?.setsLost||0));
        const aPts = Number(r?.a?.pointsDiff||0);
        const bPts = Number(r?.b?.pointsDiff||0);
        const favSetDiff = (favSideChar==='A') ? aSetDiff : bSetDiff;
        const dogSetDiff = (favSideChar==='A') ? bSetDiff : aSetDiff;
        const favPtsDiff = (favSideChar==='A') ? aPts : bPts;
        const dogPtsDiff = (favSideChar==='A') ? bPts : aPts;
        marginSets += (favSetDiff - dogSetDiff);
        marginPoints += (favPtsDiff - dogPtsDiff);
      }
      const advCO = (marginSets>0 || (marginSets===0 && marginPoints>0)) ? 'fav' : ((marginSets<0 || (marginSets===0 && marginPoints<0)) ? 'dog' : 'tie');
      const conf01 = Math.max(pCons, 1 - pCons);

      // PLUS
      const plus_FS = 0.25 * stepUp(sumFS, 0.00, 0.60);
      const plus_BT = 0.20 * clamp01(btStrength) * sgnBool(btAgree);
      const plus_StabLevel = 0.10 * stepUp(stabFavPct, 65, 80);
      const plus_StabGap = 0.10 * stepUp(deltaStab, 8, 15);
      const plus_Ext = 0.05 * stepUp(extProFav, 65, 80);
      const plus_ScoreOnly = 0.10 * (nbFav==null ? 0 : stepUp(nbFav - 0.50, 0.02, 0.10));
      const plusParts = [
        { name:'F/S/D/T', w: +plus_FS.toFixed(3), text: `${['dF','dS','dD','dT'].map(k=> (Number(del[k]||0)).toFixed(2)).join(' / ')}` },
        { name:'BT согласие', w: +plus_BT.toFixed(3), text: (totalVotes>0? `${favVotes}/${totalVotes}` : '') },
        { name:'Стабильность (уровень)', w: +plus_StabLevel.toFixed(3), text: `${Math.round(stabFavPct)}%` },
        { name:'ΔStab (fav−dog)', w: +plus_StabGap.toFixed(3), text: `${Math.round(stabFavPct)}% vs ${Math.round(stabUndPct)}%` },
        { name:'ExtPro фаворита', w: +plus_Ext.toFixed(3), text: `${extProFav}%` },
        { name:'"Только счёт" поддерживает', w: +plus_ScoreOnly.toFixed(3), text: (nbFav!=null? `${Math.round(nbFav*100)}%` : '') }
      ];
      const plus = plusParts.reduce((s,r)=> s + r.w, 0);

      // Fill simple rule checklist rows in UI
      const setRule = (id, ok, note='') => {
        const el = document.getElementById(id); if (!el) return;
        const text = ok==null ? '—' : (ok ? 'Да' : 'Нет');
        el.textContent = note ? `${text} (${note})` : text;
        resetHL(el);
        if (ok===true) applyTier(el, 'good'); else if (ok===false) applyTier(el, 'bad');
      };
      // 1) ext у фаворита > 50%
      setRule('favRuleExt', (extProFav!=null ? extProFav > 50 : null), (extProFav!=null? `${extProFav}%` : ''));
      // 2) Общие соперники: преимущество у фаворита
      let commonNote = '';
      if (gamesCO>0) commonNote = `n=${gamesCO}, Δsets=${marginSets}, Δpts=${marginPoints}`;
      const commonOk = (gamesCO>=1 ? (advCO === 'fav') : null);
      setRule('favRuleCommon', commonOk, commonNote);
      // 3) BT: на стороне фаворита (простое большинство)
      const btOk = (totalVotes>0 ? (favVotes >= Math.ceil(totalVotes/2)) : null);
      setRule('favRuleBT', btOk, (totalVotes>0? `${favVotes}/${totalVotes}` : ''));
      // 4) Без BT: ≥ 60% и совпадает с BT
      const noBtFavName = (function(){
        const a = Number(d?.playerA?.nonBTProbability); const b = Number(d?.playerB?.nonBTProbability);
        if (!isNaN(a) && !isNaN(b)) return (a>=b? (d?.playerA?.name||'A') : (d?.playerB?.name||'B'));
        return null;
      })();
      const btFavName2 = (typeof d.bt_favorite === 'string') ? d.bt_favorite : ((typeof d.bt_p_match === 'number') ? (d.bt_p_match>=0.5? d.playerA.name : d.playerB.name) : null);
      const nbPctFav = (function(){ const v = isAFav? Number(d?.playerA?.nonBTProbability) : Number(d?.playerB?.nonBTProbability); return isNaN(v)? null : v; })();
      const noBTok = (nbPctFav!=null && nbPctFav>=60 && noBtFavName && btFavName2 && (noBtFavName===btFavName2));
      setRule('favRuleNoBT', (nbPctFav==null || !btFavName2)? null : noBTok, (nbPctFav!=null? `${Math.round(nbPctFav)}%` : ''));
      // 5) Логистическая модель (3): > 55% на фаворита из блока «Прогноз»
      const computeOut3ForRules = () => {
        try {
          const recA10 = d?.recentsA10 || [];
          const recB10 = d?.recentsB10 || [];
          const A = recA10.slice(0,3), B = recB10.slice(0,3);
          const perMatchSetDiff = (rec)=> rec.map(m=>{ const s=Array.isArray(m.setsOwnOpponent)?m.setsOwnOpponent:[]; let d=0; for(const [x,y] of s){ d += ((+x||0)-(+y||0)); } return d; });
          const emaArr = (arr,a)=>{ if(!arr.length) return 0; let s=arr[0]; for(let i=1;i<arr.length;i++){ s = a*arr[i] + (1-a)*s; } return s; };
          const slope3 = (arr)=>{ const n=arr.length; if(n<=1) return 0; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<n;i++){ const x=i+1,y=arr[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x;} const denom=n*sxx - sx*sx; if(!denom) return 0; return (n*sxy - sx*sy)/denom; };
          const setsAvgDiffPerSet = (rec)=>{ let s=0,c=0; for(const m of rec){ const sets=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; for(const [x,y] of sets){ s += ((+x||0)-(+y||0)); c++; } } return c? (s/(11*c)) : 0; };
          const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
          const perA = perMatchSetDiff(A), perB = perMatchSetDiff(B);
          const F_short_A = emaArr(perA.slice(0,5), 0.7), F_short_B = emaArr(perB.slice(0,5), 0.7);
          const Trend_A = slope3(perA), Trend_B = slope3(perB);
          const dF = clamp(((F_short_A - F_short_B) + 0.5*(Trend_A - Trend_B)) / 6, -1, 1);
          // Strength proxy from S_star already computed above
          const SstarA = d?.playerA?.S_star, SstarB = d?.playerB?.S_star;
          let dS = (isFinite(SstarA)&&isFinite(SstarB))? ((SstarA - SstarB)/0.5) : 0; dS = clamp(dS, -1, 1);
          const A10 = setsAvgDiffPerSet(recA10), B10 = setsAvgDiffPerSet(recB10);
          const A5  = setsAvgDiffPerSet(recA10.slice(0,5)),  B5 = setsAvgDiffPerSet(recB10.slice(0,5));
          let baseD = 0.6*((A5-B5)) + 0.4*((A10-B10));
          const favA3 = (Number(d?.playerA?.nonBTProbability3)||0) >= (Number(d?.playerB?.nonBTProbability3)||0);
          const hFav = favA3? (d?.h2hOrientedA||[]) : (d?.h2hOrientedB||[]);
          const lostK = (k)=>{ let c=0; for(let i=0;i<Math.min(k,hFav.length);i++){ const fo=hFav[i]?.finalScoreOwnOpponent; const win = fo && Number(fo.own)>Number(fo.opponent); if (win===false) c++; } return c===k; };
          let blow = 0; const PD3_A = (function(){ let s=0; for(const m of A){ const ss=Array.isArray(m.setsOwnOpponent)? m.setsOwnOpponent:[]; for(const [x,y] of ss){ s += ((+x||0)-(+y||0)); } } return s; })();
          if (favA3){ if (PD3_A>=25) blow += 0.12; }
          if (lostK(2)) blow += 0.20; if (lostK(3)) blow += 0.35;
          let dD = clamp((baseD - blow)/4, -1, 1);
          const pairRates = (()=>{ let tb=0,sets=0,long=0,m=0; [A,B].forEach(arr=>{ arr.forEach(mm=>{ const s=Array.isArray(mm.setsOwnOpponent)? mm.setsOwnOpponent:[]; if(s.length){ m++; if(s.length>=4) long++; } s.forEach(([x,y])=>{ const aa=+x||0,bb=+y||0; if(aa>=10&&bb>=10) tb++; sets++; }); }); }); return { tb: (sets? tb/sets:0), long:(m? long/m:0) }; })();
          const EXT_A = extA, EXT_B = extB; // ext from patterns, 0..100
          const STAB_A = Math.round(100 * (stabilityA>1? stabilityA/100 : stabilityA));
          const STAB_B = Math.round(100 * (stabilityB>1? stabilityB/100 : stabilityB));
          let dT_raw = 0.6*((EXT_A-EXT_B)/100) + 0.2*((STAB_A-STAB_B)/100) + 0.2*(pairRates.tb - 0.5) + 0.2*(pairRates.long - 0.5);
          if ((EXT_B - EXT_A) >= 12 && favA3) dT_raw -= 0.25; let dT = clamp(dT_raw/0.7, -1, 1);
          const z = 0 + 0.35*dF + 0.30*dS + 0.25*dD + 0.15*dT;
          let pFav = 1/(1+Math.exp(-z));
          if (lostK(2)) pFav = 1/(1+Math.exp(-(z-0.30)));
          if (lostK(3)) pFav = 1/(1+Math.exp(-(z-0.50)));
          const pA = favA3 ? pFav : (1-pFav);
          const pB = 1 - pA;
          return { pA, pB };
        } catch(_) { return { pA: null, pB: null }; }
      };
      const out3Rules = computeOut3ForRules();
      const model3FavPct = (out3Rules.pA!=null && out3Rules.pB!=null) ? Math.round(Math.max(out3Rules.pA, out3Rules.pB) * 100) : null;
      const logitOk = (model3FavPct!=null ? (model3FavPct > 55) : null);
      setRule('favRuleLogit', logitOk, (model3FavPct!=null? `${model3FavPct}%` : ''));
      // 6) Индекс силы/форма (10 игр): ≥ 65%
      const idxOk = (pIdxFav!=null ? (pIdxFav>=0.65) : null);
      setRule('favRuleStrengthIdx', idxOk, (pIdxFav!=null? `${Math.round(pIdxFav*100)}%` : ''));

      // PENALTIES
      const penalty_StabGap = 0.10 * stepUp((stabUndPct - stabFavPct), 8, 15);
      let penalty_CommonOpp = 0;
      if (gamesCO >= 2) {
        const base = stepUp(Math.abs(marginSets), 1, 5);
        const adj  = clamp01(Math.abs(marginPoints)/30);
        penalty_CommonOpp = 0.12 * clamp01(0.6*base + 0.4*adj) * sgnBool(advCO === 'dog');
      }
      const dExt = extProFav - extProDog;
      const penalty_Ext = 0.10 * stepUp(-dExt, 5, 15) * stepDown(extProFav, 55, 45);
      const conflict = Math.abs( (btAgree?1:0) - stepUp(pLogFav||0.5, 0.50, 0.65) );
      const penalty_Conflict = 0.08 * conflict;
      const penalty_LowConf = 0.05 * stepDown(conf01, 0.55, 0.50);

      // Red flag: favorite strongly dominates H2H (10–0, 9–1, 8–2, 7–3)
      const h2hSumA = (d?.h2h?.summary?.A) || {};
      const h2hSumB = (d?.h2h?.summary?.B) || {};
      const favH2HWins = isAFav ? (h2hSumA.wins||0) : (h2hSumB.wins||0);
      const favH2HLoss = isAFav ? (h2hSumB.wins||0) : (h2hSumA.wins||0);
      const isFavH2HDom = (
        (favH2HWins===10 && favH2HLoss===0) ||
        (favH2HWins===9 && favH2HLoss===1)  ||
        (favH2HWins===8 && favH2HLoss===2)  ||
        (favH2HWins===7 && favH2HLoss===3)
      );
      const penFavH2HDom = isFavH2HDom ? 0.04 : 0;

      // Доп. риск: последние 2 H2H подряд проиграл фаворит
      const h2hFavArr = isAFav ? (d?.h2hOrientedA || []) : (d?.h2hOrientedB || []);
      const last2 = h2hFavArr.slice(0,2);
      const last2Losses = (last2.length===2) && last2.every(m => {
        const fo = m && m.finalScoreOwnOpponent; return fo && typeof fo.own==='number' && typeof fo.opponent==='number' && fo.own < fo.opponent;
      });
      const penLast2H2H = last2Losses ? 0.03 : 0;

      const riskParts = [
        { name:'ΔStab против фаворита', w: +penalty_StabGap.toFixed(3), details: `${Math.round(stabFavPct)}% vs ${Math.round(stabUndPct)}%` },
        { name:'Общие соперники против', w: +penalty_CommonOpp.toFixed(3), details: (gamesCO? `n=${gamesCO}, Δsets=${marginSets}, Δpts=${marginPoints}` : '') },
        { name:'Концовки хуже (ExtPro)', w: +penalty_Ext.toFixed(3), details: `${extProFav}% vs ${extProDog}%` },
        { name:'Конфликт логит ↔ индекс', w: +penalty_Conflict.toFixed(3), details: (totalVotes? `${favVotes}/${totalVotes}` : '') },
        { name:'Низкая уверенность сводки', w: +penalty_LowConf.toFixed(3), details: `${Math.round(conf01*100)}%` }
      ];
      const minus = riskParts.reduce((s,r)=> s + r.w, 0);
      const score = +(Math.max(0, Math.min(1, plus - minus))).toFixed(3);
      const score100 = Math.round(score * 100);
      let band; if (score >= 0.60) band = 'GREEN'; else if (score >= 0.30) band = 'YELLOW'; else band = 'RED';

      // Build header + card
      const hdr = document.getElementById('favRulesHeader');
      const sub = document.getElementById('favRulesSub');
      const card = document.getElementById('favRulesCard');
      const fillBar = document.getElementById('favScoreFill');
      const blk = document.getElementById('favRulesBlock');
      // Global summary elements
      const gFav = document.getElementById('summaryFav');
      const gBadge = document.getElementById('summaryScoreBadge');
      const gFill = document.getElementById('summaryScoreFill');
      const gRisk = document.getElementById('summaryRiskBadge');
      if (hdr) hdr.textContent = `Фаворит: ${favName}`;
      if (sub) sub.textContent = `Score = ${(plus-minus).toFixed(2)} • ${score100}% • Плюсы +${plus.toFixed(2)} / Штрафы −${minus.toFixed(2)}`;
      if (card) {
        card.classList.remove('card-green','card-yellow','card-red');
        card.innerHTML = `Итоговый вердикт: ${band} • Score ${score.toFixed(2)} • ${score100}%<div class="score-bar"><div class="score-fill" id="favScoreFill" style="width:${score100}%"></div></div>`;
        if (band==='GREEN') card.classList.add('card-green');
        else if (band==='YELLOW') card.classList.add('card-yellow');
        else card.classList.add('card-red');
      }
      if (fillBar) fillBar.style.width = `${score100}%`;

      // Fill global summary lines
      try {
        const pLogA2 = (typeof d?.forecast?.pA === 'number') ? d.forecast.pA : null;
        const pLogFav2 = (pLogA2!=null) ? (isAFav ? pLogA2 : (1 - pLogA2)) : null;
        if (gFav) gFav.textContent = `Fav: ${favName} • Logit-шанс победы: ${pLogFav2!=null? Math.round(pLogFav2*100): '—'}%`;
        if (gBadge) {
          gBadge.classList.remove('badge-green','badge-yellow','badge-red');
          gBadge.textContent = `Качество ставки → Score ${score.toFixed(2)} → ${band} (${score100}%)`;
          if (band==='GREEN') gBadge.classList.add('badge-green');
          else if (band==='YELLOW') gBadge.classList.add('badge-yellow');
          else gBadge.classList.add('badge-red');
        }
        if (gFill) gFill.style.width = `${score100}%`;
        if (gRisk) { gRisk.textContent = ''; gRisk.title=''; }
      } catch(_) {}

      // Table rows with badges/icons; hide zeros by default
      const badge = (v, type) => `<span class="badge ${type}">${v}</span>`;
      const iconForPlus = (w) => w>0? '🟢' : '⚪';
      const iconForRisk = (w) => (w>0? '🔴' : '⚪');

      const rowsHtml = [];
      rowsHtml.push(`<tr><td colspan=\"2\" class=\"muted\">Плюсы</td></tr>`);
      for (const r of plusParts) {
        const isZero = !(r.w>0);
        const b = r.w>0? badge(`+${r.w.toFixed(2)}`, 'badge-pos') : badge('+0.00', 'badge-zero');
        const icon = iconForPlus(r.w);
        rowsHtml.push(`<tr class=\"${isZero?'row-zero':''}\"><td class=\"crit-name\"><span class=\"crit-icon\">${icon}</span>${r.name}</td><td>${b} <span class=\"rules-sub\">${r.text}</span></td></tr>`);
      }
      rowsHtml.push(`<tr><td colspan=\"2\" class=\"muted\">Риски</td></tr>`);
      const riskTips = {
        'ΔStab против фаворита': 'Соперник стабильнее по StabilityPro',
        'Общие соперники против': 'Сводная по общим соперникам за соперника',
        'Концовки хуже (ExtPro)': 'Фаворит слабее в концовках/камбэках',
        'Конфликт логит ↔ индекс': 'BT и логит направлены в разные стороны',
        'Низкая уверенность сводки': 'Индекс согласия близок к 50%'
      };
      for (const r of riskParts) {
        const isZero = !(r.w>0);
        const b = r.w>0? badge(`−${r.w.toFixed(2)}`, 'badge-neg') : badge('0.00', 'badge-zero');
        const icon = iconForRisk(r.w);
        let title = riskTips[r.name] || '';
        const det = r.details ? ` <span class=\"rules-sub\">${r.details}</span>` : '';
        rowsHtml.push(`<tr class=\"${isZero?'row-zero':''}\"><td class=\"crit-name\" title=\"${title}\"><span class=\"crit-icon\">${icon}</span>${r.name}${det}</td><td>${b}</td></tr>`);
      }
      body.innerHTML = rowsHtml.join('');

      // Toggle zeros
      const btn = document.getElementById('favRulesToggle');
      if (btn && blk) {
        // Скрываем детали по умолчанию (и нули)
        if (!blk.classList.contains('hide-zeros')) blk.classList.add('hide-zeros');
        if (!blk.classList.contains('hide-details')) blk.classList.add('hide-details');
        btn.onclick = () => {
          blk.classList.toggle('hide-details');
          btn.textContent = blk.classList.contains('hide-details') ? 'Показать разбор ▼' : 'Скрыть разбор ▲';
        };
      }

      // Summary fallback text (accessibility) + риск‑факторы
      const plusStr = plus.toFixed(2), minusStr = minus.toFixed(2), scoreStr = score.toFixed(2);
      let summaryText = `Фаворит: ${favName}. Плюсы +${plusStr} − Штрафы ${minusStr} = Score ${scoreStr} (${score100} из 100) → ${band}`;
      const riskList = [];
      if (penalty_CommonOpp > 0) riskList.push('❌ Общие соперники против');
      if (penalty_StabGap > 0) riskList.push('❌ ΔStab против фаворита');
      if (penalty_Ext > 0) riskList.push('❌ Концовки хуже (ExtPro)');
      if (penalty_Conflict > 0) riskList.push('⚠ Конфликт BT и логита');
      if (penalty_LowConf > 0) riskList.push('⚠ Низкая уверенность сводки');
      if (riskList.length) summaryText += `\n${riskList.join(' • ')}`;
      sumEl.textContent = summaryText;
    } catch (e) { console.warn('fillFavRules error', e); }
  }

  // Start analyze on load
  launchAnalyze();

  launchAnalyze();
});

// === Блок: Вероятность длинного матча (ТБ 3.5) ===
function predictTB35(extA, extB, stabA, stabB) {
  const clamp = (x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
  const s = (z)=>1/(1+Math.exp(-z));
  const dExt = Math.abs(extA - extB);
  const avgExt = (extA + extB) / 2;
  const dStab = Math.abs(stabA - stabB);
  const score = 3.2 - 0.04 * dExt + 0.05 * (80 - avgExt) + 0.03 * dStab;
  const p = s(score);
  return Math.round(clamp(p,0,1) * 100);
}

function fillTB35(d){
  try {
    const badge = document.getElementById('tb35Badge');
    const note  = document.getElementById('tb35Note');
    const expl  = document.getElementById('tb35Explain');
    if (!badge || !note || !expl) return;

    const clamp01 = (x)=>Math.min(1,Math.max(0,Number(x)||0));
    const toPct = (x)=>{ const v=Number(x)||0; return v<=1? v*100 : v; };

    // Compute EXT% per player (reuse logic similar to fav rules)
    function getRate(obj, preferLoss=false){
      if (!obj) return 0.5;
      if (typeof obj.rate === 'number') return clamp01(obj.rate);
      const total = Number(obj.total||0);
      if (total<=0) return 0.5;
      const wins = Number(preferLoss ? obj.losses||0 : obj.wins||0);
      return clamp01(wins/Math.max(1,total));
    }
    function computeExtPct(pat){
      const C1 = 1 - getRate(pat?.loss_after_2_1_obj, true);
      const C2 = 1 - getRate(pat?.loss_after_two_set_run, true);
      const C3 = 1 - getRate(pat?.tiebreak_losses, true);
      const C4 = getRate(pat?.decisive_fifth_wins ?? pat?.win_at_2_2, false);
      const ext = (0.30*C1 + 0.30*C2 + 0.20*C3 + 0.20*C4) * 100;
      return Math.round(ext);
    }

    const extA = computeExtPct(d.playerA?.patterns || {});
    const extB = computeExtPct(d.playerB?.patterns || {});

    const stabAraw = d.playerA?.stability; const stabBraw = d.playerB?.stability;
    const stabA = Math.round(toPct(stabAraw));
    const stabB = Math.round(toPct(stabBraw));

    const pTB = predictTB35(extA, extB, stabA, stabB);

    // Color and message
    let cls = 'badge-red', msg = 'Вероятен короткий матч (3:0 или 3:1)';
    if (pTB > 70) { cls = 'badge-green'; msg = 'Высокая вероятность борьбы — матч, скорее всего, затянется.'; }
    else if (pTB >= 55) { cls = 'badge-yellow'; msg = 'Возможен затяжной матч'; }

    badge.classList.remove('badge-green','badge-yellow','badge-red');
    badge.classList.add(cls);
    badge.textContent = `🎯 Вероятность длинного матча (≥ 4 сетов): ${pTB}%`;

    const engBadge = (cls==='badge-green') ? '🟢 Long Match Expected' : (cls==='badge-yellow' ? '🟡 Possible 5-set battle' : '🔴 Likely Quick Win');
    note.textContent = engBadge;

    expl.textContent = `EXT A=${extA} • EXT B=${extB} • STAB A=${stabA}% • STAB B=${stabB}%`;
  } catch(e){ console.warn('fillTB35 error', e); }
}

// --- Override: New committee-based favorite decision ---
// This redefines fillFavRules with the committee + policy described in the spec.
function fillFavRules(d){
  try {
    const body = document.getElementById('favRulesBody');
    const sumEl = document.getElementById('favRulesSummary');
    if (!body || !sumEl) return;

    const clamp = (x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
    const clamp01 = (x)=>clamp(x,0,1);
    const pct = (p)=> (p==null? '—' : `${Math.round(p*100)}%`);

    const pBT_A = (typeof d.bt_p_match === 'number') ? clamp01(d.bt_p_match) : (typeof d?.forecast?.pA==='number'? clamp01(d.forecast.pA) : 0.5);
    const favSideIsA = pBT_A >= 0.5;
    const favName = favSideIsA ? (d?.playerA?.name||'A') : (d?.playerB?.name||'B');

    function toNum(x){ if (typeof x === 'number') return x; const s=String(x||'').replace('%',''); const v=parseFloat(s); return isNaN(v)? null : v/100; }
    function favWinSumFromScores(list, favIsA){
      if (!Array.isArray(list)) return null;
      const pick = new Set(favIsA ? ['3:0','3:1','3:2'] : ['0:3','1:3','2:3']);
      let s = 0, n = 0; for (const it of list) { const sc=String(it.score||''); const p=toNum(it.probability ?? it.label); if (p!=null) { n++; if (pick.has(sc)) s += p; } }
      return n>0 ? clamp01(s) : null;
    }
    let pScoreFav = null;
    if (Array.isArray(d.btOldScoreProbs)) pScoreFav = favWinSumFromScores(d.btOldScoreProbs, favSideIsA);
    if (pScoreFav==null && Array.isArray(d.predictedScores)) pScoreFav = favWinSumFromScores(d.predictedScores, favSideIsA);
    if (pScoreFav==null) {
      const nbA = (typeof d.playerA?.nonBTProbability==='number')? d.playerA.nonBTProbability/100 : null;
      const nbB = (typeof d.playerB?.nonBTProbability==='number')? d.playerB.nonBTProbability/100 : null;
      if (nbA!=null && nbB!=null) pScoreFav = favSideIsA? nbA : nbB;
    }
    if (pScoreFav==null) pScoreFav = favSideIsA ? pBT_A : (1 - pBT_A);

    let h2h_sets_A = 0, h2h_sets_B = 0;
    try { const det = d?.h2h?.setWins?.detailed; if (det?.summary) { h2h_sets_A = Number(det.summary.playerAWins || 0); h2h_sets_B = Number(det.summary.playerBWins || 0); } } catch(_){ }
    const L = 8;
    const pH2H_A = (h2h_sets_A + L) / Math.max(1, (h2h_sets_A + h2h_sets_B + 2*L));
    const pH2H_fav = favSideIsA ? pH2H_A : (1 - pH2H_A);

    function rateFrom(obj, {preferLoss=false, L=5}={}){
      if (!obj) return 0.5;
      if (typeof obj.rate === 'number') return clamp01(obj.rate);
      const t = Number(obj.total||0), w = Number(preferLoss? (obj.losses||0) : (obj.wins||0));
      return (w + L) / Math.max(1, (t + 2*L));
    }
    const favPat = favSideIsA? (d.playerA?.patterns||{}) : (d.playerB?.patterns||{});
    const dogPat = favSideIsA? (d.playerB?.patterns||{}) : (d.playerA?.patterns||{});
    const winTB_fav = 1 - rateFrom(favPat?.tiebreak_losses, {preferLoss:true});
    const winTB_dog = 1 - rateFrom(dogPat?.tiebreak_losses, {preferLoss:true});
    const choke21_fav = rateFrom(favPat?.loss_after_2_1_obj, {preferLoss:true});
    const choke21_dog = rateFrom(dogPat?.loss_after_2_1_obj, {preferLoss:true});
    const loseWW_fav = rateFrom(favPat?.loss_after_two_set_run, {preferLoss:true});
    const loseWW_dog = rateFrom(dogPat?.loss_after_two_set_run, {preferLoss:true});
    const decFav = rateFrom(favPat?.decisive_fifth_wins ?? favPat?.win_at_2_2);
    const decDog = rateFrom(dogPat?.decisive_fifth_wins ?? dogPat?.win_at_2_2);
    const cmbFav = rateFrom(favPat?.win_after_1_2 ?? favPat?.comeback_after_1_2);
    const cmbDog = rateFrom(dogPat?.win_after_1_2 ?? dogPat?.comeback_after_1_2);
    const zTB = winTB_fav - winTB_dog;
    const zChoke = -(choke21_fav - choke21_dog);
    const zLoseWW = -(loseWW_fav - loseWW_dog);
    const zDec = decFav - decDog;
    const zCmb = cmbFav - cmbDog;
    const deltaExt = 0.35*zTB + 0.25*zChoke + 0.20*zLoseWW + 0.10*zDec + 0.10*zCmb;
    const pExt_fav = (function(){ const z = Math.log(pScoreFav/(1 - pScoreFav + 1e-9)) + deltaExt; return 1/(1+Math.exp(-z)); })();

    const qFav = (typeof d?.forecast?.pA==='number') ? (favSideIsA? d.forecast.pA : (1 - d.forecast.pA)) : (favSideIsA? pBT_A : (1 - pBT_A));
    const pBT_fav = favSideIsA? pBT_A : (1 - pBT_A);

    const W = { w0:0, w1:0.9, w2:0.6, w3:0.3, w4:0.4 };
    const T = 1.0;
    const out = Committee.decide(pScoreFav, pBT_fav, pH2H_fav, pExt_fav, qFav, { W, T, nBoot:200 });
    const confPct = Committee.confidencePct(out.K, out.R, out.sigmaHat);

    const hdr = document.getElementById('favRulesHeader');
    const sub = document.getElementById('favRulesSub');
    const card = document.getElementById('favRulesCard');
    const fillBar = document.getElementById('favScoreFill');
    const blk = document.getElementById('favRulesBlock');
    const gFav = document.getElementById('summaryFav');
    const gBadge = document.getElementById('summaryScoreBadge');
    const gFill = document.getElementById('summaryScoreFill');
    const gRisk = document.getElementById('summaryRiskBadge');

    if (hdr) hdr.textContent = `Фаворит: ${favName}`;
    const valuePctPts = Math.round(out.value*10000)/100;
    if (sub) sub.textContent = `Вердикт: ${out.verdict}${out.color? ' • '+out.color: ''} • P=${pct(out.p)} • Value=${valuePctPts>=0? '+':''}${valuePctPts} п.п. • K=${(out.K).toFixed(2)} • R=${(out.R).toFixed(2)} • σ=${(out.sigmaHat).toFixed(3)} • Уверенность=${confPct}%`;
    if (card) {
      card.classList.remove('card-green','card-yellow','card-red');
      const band = (out.verdict==='NO BET')? 'YELLOW' : (out.color || 'YELLOW');
      card.innerHTML = `Итоговый вердикт: ${out.verdict}${out.color? ' • '+out.color: ''} • P ${pct(out.p)}<div class="score-bar"><div class="score-fill" id="favScoreFill" style="width:${Math.round(clamp01(out.p)*100)}%"></div></div>`;
      if (band==='GREEN') card.classList.add('card-green');
      else if (band==='YELLOW') card.classList.add('card-yellow');
      else card.classList.add('card-red');
    }
    if (fillBar) fillBar.style.width = `${Math.round(clamp01(out.p)*100)}%`;

    try {
      if (gFav) gFav.textContent = `Fav: ${favName} • Комитет (калибр.): ${pct(out.p)}`;
      // Show only the first line in the global summary block
      try {
        const gs = document.getElementById('globalSummary');
        const line2 = gs ? gs.querySelector('.summary-line2') : null;
        if (line2) line2.style.display = 'none';
      } catch(_) {}
      if (gBadge) {
        gBadge.classList.remove('badge-green','badge-yellow','badge-red');
        const band = (out.verdict==='NO BET')? 'YELLOW' : (out.color || 'YELLOW');
        gBadge.textContent = `Политика: ${out.verdict}${out.color? ' • '+out.color: ''} • Value ${valuePctPts>=0? '+':''}${valuePctPts} п.п.`;
        if (band==='GREEN') gBadge.classList.add('badge-green');
        else if (band==='YELLOW') gBadge.classList.add('badge-yellow');
        else gBadge.classList.add('badge-red');
      }
      if (gFill) gFill.style.width = `${Math.round(clamp01(out.p)*100)}%`;
      if (gRisk) { gRisk.textContent = `Уверенность: ${confPct}%`; gRisk.title=''; }
    } catch(_) {}

    const rows = [];
    const badge = (v, type) => `<span class="badge ${type}">${v}</span>`;
    function bandVal(val){ if (val>=0.68) return 'badge-pos'; if (val>=0.55) return 'badge-zero'; return 'badge-neg'; }
    rows.push(`<tr><td colspan="2" class="muted">Вероятности компонентов</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">📊</span>OnlyScore</td><td>${badge(pct(pScoreFav),'badge-zero')}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">🧮</span>BT/Логит</td><td>${badge(pct(pBT_fav),'badge-zero')}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">🤝</span>H2H-наслоение</td><td>${badge(pct(pH2H_fav),'badge-zero')}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">🧠</span>Ext/Stability</td><td>${badge(pct(pExt_fav),'badge-zero')}</td></tr>`);
    rows.push(`<tr><td colspan="2" class="muted">Согласие и неопределённость</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">📈</span>Консенсус K</td><td>${badge((out.K).toFixed(2), bandVal(out.K))}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">📉</span>Разброс R</td><td>${badge((out.R).toFixed(2),'badge-zero')}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">σ</span>Непределённость</td><td>${badge((out.sigmaHat).toFixed(3), (out.sigmaHat>0.07?'badge-neg':'badge-zero'))}</td></tr>`);
    rows.push(`<tr><td colspan="2" class="muted">Value / Уверенность</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">💹</span>Value</td><td>${badge(`${valuePctPts>=0? '+':''}${valuePctPts} п.п.`, (out.value>=0.03?'badge-pos': (out.value>0?'badge-zero':'badge-neg')))}</td></tr>`);
    rows.push(`<tr><td class="crit-name"><span class="crit-icon">🔒</span>Уверенность</td><td>${badge(`${confPct}%`, bandVal(confPct/100))}</td></tr>`);
    body.innerHTML = rows.join('');

    const btn = document.getElementById('favRulesToggle');
    if (btn && blk) {
      if (!blk.classList.contains('hide-zeros')) blk.classList.add('hide-zeros');
      if (!blk.classList.contains('hide-details')) blk.classList.add('hide-details');
      btn.onclick = () => {
        blk.classList.toggle('hide-details');
        btn.textContent = blk.classList.contains('hide-details') ? 'Показать разбор ▼' : 'Скрыть разбор ▲';
      };
    }

    let summaryText = `Фаворит: ${favName}. Вердикт: ${out.verdict}${out.color? ' • '+out.color: ''}. Комитет P=${pct(out.p)}, Value=${valuePctPts>=0? '+':''}${valuePctPts} п.п., K=${out.K.toFixed(2)}, R=${out.R.toFixed(2)}, σ=${out.sigmaHat.toFixed(3)}, Уверенность ${confPct}%`;
    sumEl.textContent = summaryText;
  } catch (e) { console.warn('fillFavRules error', e); }
}
