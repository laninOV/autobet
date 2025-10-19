// ===== Bradley-Terry Model for Bo5 Tennis Matches =====
// Ported locally from the other extension to be reusable here.

// Make this file idempotent: if already injected, do nothing
(function(){
  if (typeof window !== 'undefined') {
    if (window.__TSX_BT_LIB_LOADED__) return;
    window.__TSX_BT_LIB_LOADED__ = true;
  }

  // ===== Utilities =====
  const clamp01 = x => Math.min(1 - 1e-6, Math.max(1e-6, x));
  const logit = p => Math.log(p / (1 - p));
  const invLogit = z => 1 / (1 + Math.exp(-z));

const wstd = (xs) => {
  const m = xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
  const v = xs.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,xs.length);
  return Math.sqrt(v);
};

function timeWeight(deltaDays, halfLife = 21) {
  return halfLife > 0 ? Math.exp(-deltaDays / halfLife) : 1;
}

function marginBump(diff, beta = 0.05) {
  const m = Math.max(0, Math.min(0.5, (diff - 2) / 9));
  return 1 + beta * m;
}

// ===== Build directed graph =====
function buildGraph(matches, {halfLife = 21, betaMargin = 0.05, lambdaMatch = 0.45, alphaPrior = 5.0} = {}) {
  const players = new Set();
  matches.forEach(m => { players.add(m.home); players.add(m.away); });

  const ghost = "__BT_GHOST__";
  const now = matches.reduce((d, m) => !d || m.date > d ? m.date : d, null);
  const W = new Map(), N = new Map();
  const K = (i, j) => i + "__" + j;
  const add = (M, i, j, v) => M.set(K(i, j), (M.get(K(i, j)) || 0) + v);

  for (const m of matches) {
    const Δ = now && m.date ? Math.max(0, (now - m.date) / (1000 * 3600 * 24)) : 0;
    const wt = timeWeight(Δ, halfLife);
    let homeSetsWon = 0;

    for (const [h, a] of (m.sets || [])) {
      if (h === a) continue;
      const w = wt * marginBump(Math.abs(h - a), betaMargin);
      if (h > a) add(W, m.home, m.away, w); else add(W, m.away, m.home, w);
      add(N, m.home, m.away, w); add(N, m.away, m.home, w);
      if (h > a) homeSetsWon++;
    }

    const awaySetsWon = (m.sets || []).length - homeSetsWon;
    if (homeSetsWon !== awaySetsWon) {
      const winner = homeSetsWon > awaySetsWon ? m.home : m.away;
      const loser = winner === m.home ? m.away : m.home;
      add(W, winner, loser, lambdaMatch * wt);
      add(N, winner, loser, lambdaMatch * wt);
      add(N, loser, winner, lambdaMatch * wt);
    }
  }

  // Regularization via ghost player
  for (const p of players) {
    add(W, p, ghost, alphaPrior);
    add(W, ghost, p, alphaPrior);
    add(N, p, ghost, 2 * alphaPrior);
    add(N, ghost, p, 2 * alphaPrior);
  }
  players.add(ghost);

  return {players: [...players], W, N, ghost};
}

// ===== MM iterations =====
function btRatings(graph, {maxIter = 1000, tol = 1e-8} = {}) {
  const {players, W, N} = graph;
  const r = Object.fromEntries(players.map(p => [p, 1]));
  const get = (M, i, j) => M.get(i + "__" + j) || 0;

  for (let it = 0; it < maxIter; it++) {
    const wsum = Object.fromEntries(players.map(p => [p, 0]));
    const nden = Object.fromEntries(players.map(p => [p, 0]));

    for (const i of players) {
      for (const j of players) {
        if (i === j) continue;
        const nij = get(N, i, j);
        if (nij <= 0) continue;
        wsum[i] += nij;
        nden[i] += nij / (r[i] + r[j]);
      }
    }

    for (const i of players) {
      for (const j of players) {
        if (i === j) continue;
        const wij = get(W, i, j);
        if (wij > 0) wsum[i] += wij;
      }
    }

    let maxRel = 0;
    for (const p of players) {
      if (nden[p] > 0) {
        const newr = Math.max(1e-12, wsum[p] / nden[p]);
        maxRel = Math.max(maxRel, Math.abs(newr - r[p]) / Math.max(r[p], 1e-12));
        r[p] = newr;
      }
    }
    if (maxRel < tol) break;
  }
  return r;
}

// ===== Bo5 distribution =====
function bo5ScoreDist(p) {
  p = clamp01(p);
  const q = 1 - p;
  return {
    "3:0": p**3,
    "3:1": 3 * (p**3) * q,
    "3:2": 6 * (p**3) * (q**2),
    "0:3": q**3,
    "1:3": 3 * (q**3) * p,
    "2:3": 6 * (q**3) * (p**2)
  };
}

const bo5MatchWin = (p) => {
  const d = bo5ScoreDist(p);
  return d["3:0"] + d["3:1"] + d["3:2"];
};

const calibrate = (p, t = 1.2) => t <= 1 ? p : invLogit(logit(clamp01(p)) / t);

// ===== H2H set share =====
function h2hSetShare(h2h, nameA, nameB){
  let SA=0, SB=0;
  for (const m of (h2h||[])) {
    const aHome = m.home===nameA && m.away===nameB;
    const bHome = m.home===nameB && m.away===nameA;
    if (!aHome && !bHome) continue;
    for (const [h,a] of (m.sets || [])) {
      if (aHome) { SA += (h>a)?1:0; SB += (a>h)?1:0; }
      else       { SA += (a>h)?1:0; SB += (h>a)?1:0; }
    }
  }
  const total = SA+SB;
  const p = (SA+1) / (total + 2);
  return {p, total};
}

// ===== Core BT winner =====
function btWinner(last5A, last5B, h2h, nameA, nameB, hyper = {}) {
  const H = Object.assign({
    halfLife: 21,
    betaMargin: 0.05,
    lambdaMatch: 0.45,
    alphaPrior: 5.0,
    temperature: 1.6,      // base; will adapt below
    h2hMaxWeight: 0.35,
    h2hTau: 10,
    h2hDevBoost: 0.08
  }, hyper);

  const graph = buildGraph([...last5A, ...last5B, ...(h2h || [])], H);
  const r = btRatings(graph);
  const rA = r[nameA] || 1, rB = r[nameB] || 1;

  const p_set_raw = rA / (rA + rB);

  let p_set_base = p_set_raw;
  try {
    if (h2h && h2h.length) {
      const {p: pH2H, total: setsTotal} = h2hSetShare(h2h, nameA, nameB);
      const base = H.h2hMaxWeight * (1 - Math.exp(-Math.max(0, setsTotal) / Math.max(1e-6, H.h2hTau)));
      const dev = Math.abs(pH2H - 0.5);
      const boost = Math.min(H.h2hDevBoost, Math.max(0, (dev - 0.05) * 1.2));
      const w = Math.min(H.h2hMaxWeight, base + boost);
      const z = (1 - w) * logit(clamp01(p_set_raw)) + w * logit(clamp01(pH2H));
      p_set_base = invLogit(z);
    }
  } catch (_) {}

  // Adaptive temperature by data volume (sets count across inputs)
  try {
    const countSets = (arr) => (arr||[]).reduce((s,m)=> s + ((m.sets&&m.sets.length)||0), 0);
    const nSets = countSets(last5A) + countSets(last5B) + countSets(h2h);
    const vol = Math.max(0, Math.min(1, nSets / 60)); // up to ~60 sets → vol→1
    const t = 2.2 - 1.0 * vol; // vol=0 => 2.2, vol=1 => 1.2
    H.temperature = Math.max(1.1, Math.min(2.2, t));
  } catch(_) {}
  const p_set = calibrate(p_set_base, H.temperature);
  const p_match = bo5MatchWin(p_set);
  const dist = bo5ScoreDist(p_set);

  const scores = Object.entries(dist)
    .map(([score, prob]) => ({ score, probability: prob, pct: (prob * 100).toFixed(1) + "%" }))
    .sort((a, b) => b.probability - a.probability);

  return {
    favorite: p_match >= 0.5 ? nameA : nameB,
    ratings: { [nameA]: rA, [nameB]: rB },
    p_set_raw, p_set, p_match,
    scores
  };
}

// ===== Player set stats =====
function playerSetStats(last5, name){
  const diffs = [];
  let deciders = 0;
  let bigWin=false, bigLoss=false;
  for (const m of last5){
    const meHome = m.home===name;
    let setsWon = 0, setsLost = 0;
    let winBig=false, loseBig=false;
    for (const [h,a] of (m.sets || [])){
      const my = meHome ? h : a;
      const op = meHome ? a : h;
      diffs.push(my - op);
      if (my>op) setsWon++; else setsLost++;
      const d = my - op;
      if (d>=6) winBig=true;
      if (d<=-6) loseBig=true;
    }
    if ((setsWon===3 && setsLost===2) || (setsLost===3 && setsWon===2)) deciders++;
    if (winBig) bigWin=true;
    if (loseBig) bigLoss=true;
  }
  return { totalSets: diffs.length, sigma: diffs.length ? wstd(diffs) : 0, deciders, swings: (bigWin && bigLoss) };
}

// ===== Betting decision (relaxed thresholds) =====
function shouldBetBT({p_set_raw, p_set, p_match}, last5A, last5B, h2h, nameA, nameB, opts={}){
  const O = Object.assign({
    MIN_TOTAL_SETS: 4,
    MAX_SIGMA: 8.0,
    PMATCH_STRONG: 0.62,
    PMATCH_BASE: 0.56,
    PMATCH_MIN: 0.51
  }, opts);

  const statsA = playerSetStats(last5A, nameA);
  const statsB = playerSetStats(last5B, nameB);
  const totalSets = statsA.totalSets + statsB.totalSets;
  const hasMinimumData = totalSets >= O.MIN_TOTAL_SETS;

  if (!hasMinimumData) {
    if (p_match >= 0.55) {
      return { bet: true, tier: "C", details: {p_match, totalSets, note: "limited-data"} };
    }
    return { bet: false, reason: "insufficient-data", details: { totalSets, required: O.MIN_TOTAL_SETS, p_match } };
  }

  if (p_match >= O.PMATCH_STRONG) return { bet: true, tier: "A", details: {p_match, totalSets, sigmaA: statsA.sigma, sigmaB: statsB.sigma} };
  if (p_match >= O.PMATCH_BASE)   return { bet: true, tier: "B", details: {p_match, totalSets, sigmaA: statsA.sigma, sigmaB: statsB.sigma} };
  if (p_match >= O.PMATCH_MIN)    return { bet: true, tier: "C", details: {p_match, totalSets, sigmaA: statsA.sigma, sigmaB: statsB.sigma} };
  return { bet: false, reason: "weak-signal", details: {p_match, threshold: O.PMATCH_MIN} };
}

// ===== Betting strategy wrapper =====
function btBettingStrategy(last5A, last5B, h2h, nameA, nameB, hyper = {}) {
  const btResult = btWinner(last5A, last5B, h2h, nameA, nameB, hyper);
  const bettingDecision = shouldBetBT(
    { p_set_raw: btResult.p_set_raw, p_set: btResult.p_set, p_match: btResult.p_match },
    last5A, last5B, h2h, nameA, nameB
  );
  return {
    ...btResult,
    betting: bettingDecision,
    recommendation: bettingDecision.bet ?
      `${bettingDecision.tier === 'A' ? '🟢 СИЛЬНАЯ' : bettingDecision.tier === 'B' ? '🟡 УМЕРЕННАЯ' : '🔵 СЛАБАЯ'} СТАВКА на ${btResult.favorite} (${(btResult.p_match * 100).toFixed(1)}%)` :
      `❌ ПРОПУСК: ${bettingDecision.reason.toUpperCase()}`
  };
}

// ===== Expose =====
if (typeof window !== 'undefined') {
  window.BradleyTerry = {
    btWinner,
    bo5ScoreDist,
    bo5MatchWin,
    calibrate,
    h2hSetShare,
    playerSetStats,
    shouldBetBT,
    btBettingStrategy
  };
}

})();
