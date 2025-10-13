// Consensus index and feature pipeline
// Pure functions with minimal dependencies and dual export (browser + Node)

(function(global){
  const EPS = 1e-6;

  // Basic utils
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function clamp01(x) { return clamp(x, 0, 1); }
  function logit(p) {
    const pp = clamp(p, 1e-12, 1 - 1e-12);
    return Math.log(pp / (1 - pp));
  }
  function invLogit(z) { return 1 / (1 + Math.exp(-z)); }

  // Normalize stability input: accepts 0..1 or 0..100
  function normalizeStability(s) {
    if (!isFinite(s)) return 0;
    if (s > 1 + 1e-9) return clamp(s / 100, 0, 1);
    if (s < 0) return 0;
    return clamp01(s);
  }

  function normalizeStrength(x) {
    if (!isFinite(x)) return 0;
    return clamp(x, 0, 100);
  }

  function fatigueFactor(gamesToday) {
    const g = Math.max(0, (Number(gamesToday) || 0) - 2);
    // 4% penalty per game above 2
    return Math.max(0, 1 - 0.04 * g);
  }

  // EffS = S * (0.6 + 0.4*stab) * fatigue
  function computeEffStrength(strength, stability, gamesToday) {
    const S = normalizeStrength(Number(strength) || 0);
    const stab = normalizeStability(Number(stability) || 0);
    const f = fatigueFactor(gamesToday);
    const eff = S * (0.6 + 0.4 * stab) * f;
    return clamp(eff, 0, 100);
  }

  // Pipeline wrapper for A/B
  function computeEffStrengths({
    strengthA, strengthB,
    stabilityA, stabilityB,
    gamesTodayA = 0, gamesTodayB = 0
  }) {
    const EffS_A = computeEffStrength(strengthA, stabilityA, gamesTodayA);
    const EffS_B = computeEffStrength(strengthB, stabilityB, gamesTodayB);

    const strength_gap = clamp(((normalizeStrength(strengthA) - normalizeStrength(strengthB)) / 100) || 0, -1, 1);
    const stabA = normalizeStability(stabilityA);
    const stabB = normalizeStability(stabilityB);
    const stab_gap = clamp((stabA - stabB) || 0, -1, 1);
    const eff_gap = clamp(((EffS_A - EffS_B) / 100) || 0, -1, 1);
    const load_gap = (Number(gamesTodayA) || 0) - (Number(gamesTodayB) || 0);

    return { EffS_A, EffS_B, eff_gap, stab_gap, strength_gap, load_gap };
  }

  function safeGap(num, den) {
    const d = (Number(den) || 0);
    const n = (Number(num) || 0);
    if (Math.abs(d) < EPS) return 0;
    return clamp(n / d, -1, 1);
  }

  function penaltyFactor(n) {
    const N = Math.max(0, Number(n) || 0);
    if (N >= 4) return 1;
    return N / 4; // linear fade-in until 4 observations
  }

  // ----- Risk flags ("Красные флаги") -----
  const RISK_TEXTS_RU = {
    stabUnderdog: 'Аутсайдер стабильнее: +EV против фаворита падает',
    btNarrowVsLong: 'BT ожидает ровный счёт; матч тянет к 5-му — риск апсета',
    tbRisk: 'Фаворит плох в концовках, а их будет много',
    set3Against: 'Аутсайдер сильнее на 3-м сете (поворотный момент)',
    rematch: 'Свежая адаптация соперника. Не завышай фаворита',
    load: 'Фаворит тяжелее нагружен сегодня',
    h2hSetsNegative: 'Лёгкое преимущество силы съедает H2H-структура'
  };

  function pickP5(p5_base, p5_h2h) {
    const a = Number(p5_base);
    const b = Number(p5_h2h);
    if (isFinite(a)) return clamp01(a);
    if (isFinite(b)) return clamp01(b);
    return 0;
  }

  function getRiskFlags(inputs, {locale = 'ru'} = {}){
    const {
      strengthA = 0, strengthB = 0,
      stabilityA = 0, stabilityB = 0,
      gamesTodayA = 0, gamesTodayB = 0,
      pBT_A = 0.5,
      h2h_sets_A = 0, h2h_sets_B = 0,
      h2h_set3_A = 0, h2h_set3_B = 0,
      tb_lose_A = 0.5, tb_lose_B = 0.5,
      p5_base = null, p5_h2h = null,
      rematch = 0,
    } = inputs || {};

    // Orientation: make A = favorite by BT
    const aIsFav = (Number(pBT_A) || 0.5) >= 0.5;
    const pFav = aIsFav ? clamp01(Number(pBT_A)||0.5) : clamp01(1 - (Number(pBT_A)||0.5));

    const stabA = normalizeStability(stabilityA);
    const stabB = normalizeStability(stabilityB);
    const stabFav = aIsFav ? stabA : stabB;
    const stabDog = aIsFav ? stabB : stabA;
    const stab_gap_fav = clamp((stabFav - stabDog) || 0, -1, 1);

    const eff = computeEffStrengths({strengthA, strengthB, stabilityA, stabilityB, gamesTodayA, gamesTodayB});
    const eff_gap_fav = aIsFav ? eff.eff_gap : -eff.eff_gap;
    const load_gap_fav = aIsFav ? eff.load_gap : -eff.load_gap;
    const gamesFav = aIsFav ? (Number(gamesTodayA)||0) : (Number(gamesTodayB)||0);

    const setsFav = aIsFav ? (Number(h2h_sets_A)||0) : (Number(h2h_sets_B)||0);
    const setsDog = aIsFav ? (Number(h2h_sets_B)||0) : (Number(h2h_sets_A)||0);
    const h2h_sets_gap_fav = safeGap(setsFav - setsDog, setsFav + setsDog);

    const s3Fav = aIsFav ? (Number(h2h_set3_A)||0) : (Number(h2h_set3_B)||0);
    const s3Dog = aIsFav ? (Number(h2h_set3_B)||0) : (Number(h2h_set3_A)||0);
    const set3_edge_fav = safeGap(s3Fav - s3Dog, s3Fav + s3Dog + EPS);

    const tbFav = clamp01(aIsFav ? (Number(tb_lose_A)||0) : (Number(tb_lose_B)||0));
    const p5 = pickP5(p5_base, p5_h2h);
    const isRematch = (rematch === true || rematch === 1);

    const flags = {
      // Аутсайдер стабильнее ≥10 п.п.
      stabUnderdog: (stab_gap_fav <= -0.10),
      // Узкая BT (из явного фаворита) против длинного матча
      btNarrowVsLong: (Math.max(pFav, 1 - pFav) >= 0.65) && (p5 >= 0.35),
      // Тай-брейки + 5-й сет
      tbRisk: (tbFav >= 0.60) && (p5 >= 0.40),
      // Ключевой 3-й сет против фаворита
      set3Against: (set3_edge_fav < -0.20),
      // Рематч
      rematch: isRematch,
      // Нагрузка сегодня
      load: (gamesFav >= 4) && (load_gap_fav >= 2),
      // H2H-по-сетам отрицателен при небольшой форте фаворита
      h2hSetsNegative: (eff_gap_fav <= 0.10) && (h2h_sets_gap_fav < 0)
    };

    const activeKeys = Object.keys(flags).filter(k => !!flags[k]);
    const count = activeKeys.length;
    const riskScore = count / 7;
    const texts = (locale === 'ru' ? RISK_TEXTS_RU : RISK_TEXTS_RU);
    const messages = activeKeys.map(k => texts[k] || k);

    return {
      favoriteSide: aIsFav ? 'A' : 'B',
      flags,
      activeKeys,
      messages,
      riskScore
    };
  }

  function shouldAvoidFavorite(riskFlags){
    const flags = riskFlags && riskFlags.flags ? riskFlags.flags : riskFlags;
    if (!flags) return false;
    const count = Object.values(flags).reduce((s, v) => s + (v ? 1 : 0), 0);
    return count >= 2;
  }

  // Main consensus aggregator
  function computeConsensus(features) {
    const {
      // base inputs for pipeline
      strengthA = 0, strengthB = 0,
      stabilityA = 0, stabilityB = 0,
      gamesTodayA = 0, gamesTodayB = 0,

      // model/prob inputs
      pBT_A = 0.5, // Bradley-Terry match probability for A (can be p_match or p_set->p_match). If only set prob is available, pass converted match p.

      // H2H counts by sets total and deciders
      h2h_sets_A = 0, h2h_sets_B = 0,
      h2h_set3_A = 0, h2h_set3_B = 0,

      // tie-break performance (lose rate)
      tb_lose_A = 0.5, tb_lose_B = 0.5,

      // 5th set probabilities
      p5_base = 0, // base probability of going to 5th set (0..1)
      p5_h2h = null, // optional h2h informed p5, currently unused in z directly

      // misc flags
      rematch = 0,

      // optional sample sizes to adjust penalties
      samples = {}
    } = features || {};

    // Derived gaps from pipeline
    const { strength_gap, stab_gap, load_gap, eff_gap } = computeEffStrengths({
      strengthA, strengthB, stabilityA, stabilityB, gamesTodayA, gamesTodayB
    });

    // Core signals
    const bt_logit = logit(clamp01(Number(pBT_A) || 0.5));
    const setsA = Math.max(0, Number(h2h_sets_A) || 0);
    const setsB = Math.max(0, Number(h2h_sets_B) || 0);
    const h2h_sets_gap = safeGap(setsA - setsB, setsA + setsB);

    const s3A = Math.max(0, Number(h2h_set3_A) || 0);
    const s3B = Math.max(0, Number(h2h_set3_B) || 0);
    const set3_edge = safeGap(s3A - s3B, s3A + s3B + EPS);

    const tbA = clamp01(Number(tb_lose_A) || 0);
    const tbB = clamp01(Number(tb_lose_B) || 0);
    const tb_edge = clamp(((1 - tbA) - (1 - tbB)) || 0, -1, 1); // who is better in TBs

    const p5 = clamp01(Number(p5_base) || 0);
    const rem = (rematch === true || rematch === 1) ? 1 : 0;

    // Sample quality penalties
    const nSets = setsA + setsB;
    const nS3 = s3A + s3B;
    const nTBA = Math.max(0, (samples.tbA || 0));
    const nTBB = Math.max(0, (samples.tbB || 0));
    const nTB = Math.min(Math.max(nTBA, 0), Math.max(nTBB, 0)) || 0; // conservative

    const fSets = penaltyFactor(nSets);
    const fSet3 = penaltyFactor(nS3);
    const fTB = penaltyFactor(nTB);

    // Flags
    const stab_flag_BetterUnderdog = stab_gap <= -0.10 ? 1 : 0;
    const redFlag_TB_5set = (p5 >= 0.40 && tbA >= 0.60) ? 1 : 0;

    // Weighted aggregation
    const t_bt = 1.00 * bt_logit;
    // Используем eff_gap вместо "сырого" strength_gap в агрегаторе
    const t_strength = 0.80 * eff_gap;
    const t_stab = 0.90 * stab_gap;
    const t_h2h_sets = 0.50 * fSets * h2h_sets_gap;
    const t_set3 = 0.35 * fSet3 * set3_edge * (1 - p5);
    const t_tb = 0.35 * fTB * tb_edge * p5;
    const t_load = -0.25 * Math.max(0, load_gap);
    const t_rematch = -0.30 * rem;
    const t_tb5 = -0.25 * redFlag_TB_5set;
    const t_stabFlag = -0.35 * (stab_flag_BetterUnderdog ? 1 : 0);

    const z = (
      t_bt + t_strength + t_stab + t_h2h_sets + t_set3 + t_tb +
      t_load + t_rematch + t_tb5 + t_stabFlag
    );
    const p_consensus = invLogit(z);

    // Grade rules (orientation-invariant): strength of consensus regardless of side
    let grade;
    const hasRedFlags = (redFlag_TB_5set === 1) || (stab_flag_BetterUnderdog === 1) || (rem === 1);
    const p_star = Math.max(p_consensus, 1 - p_consensus);
    if (p_star >= 0.66 && !hasRedFlags) grade = 'A';
    else if (p_star >= 0.58) grade = 'B';
    else if (p_star >= 0.45) grade = 'C';
    else grade = 'D';

    return {
      z,
      p_consensus,
      grade,
      features: {
        strength_gap, eff_gap, stab_gap, load_gap,
        bt_logit, h2h_sets_gap, set3_edge, tb_edge, p5_base: p5
      },
      penalties: { fSets, fSet3, fTB, nSets, nS3, nTB },
      flags: {
        rematch: rem === 1,
        redFlag_TB_5set: redFlag_TB_5set === 1,
        stab_flag_BetterUnderdog: stab_flag_BetterUnderdog === 1
      },
      terms: {
        t_bt, t_strength, t_stab, t_h2h_sets, t_set3, t_tb, t_load, t_rematch, t_tb5, t_stabFlag
      }
    };
  }

  const api = {
    normalizeStability,
    computeEffStrength,
    computeEffStrengths,
    computeConsensus,
    getRiskFlags,
    shouldAvoidFavorite
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    global.Consensus = api;
  }

})(typeof window !== 'undefined' ? window : globalThis);
