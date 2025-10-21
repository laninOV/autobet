(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const logit = (p) => Math.log(p / (1 - p));

  const DEFAULT_META = {
    key: 'META_2025-10-10',
    winner: {
      w10: 0.56, w5: 0.28, w3: 0.16,
      lambda_h2h: 0.61, C_H2H: 0.22,
      beta: [0.032, 0.027, 0.11, 0.09], // β1..β4
      rho_disp: 0.88, phi_upset: 0.93
    },
    tb35: {
      a0:-5.71,a1:0.038,a2:0.023,a3:0.62,a4:0.49,a5:1.05,a6:0.54,a7:0.38,a8:0.67,a9:0.46,a10:0.91
    },
    coupling: { kappa: 0.22 }
  };

  function loadMetaParams(_key){
    // Hook for future: could fetch from storage; for now return default
    return JSON.parse(JSON.stringify(DEFAULT_META));
  }

  function computeWinner(x, W){
    try {
      const w10=W.w10,w5=W.w5,w3=W.w3; const sum=w10+w5+w3||1; const ww10=w10/sum, ww5=w5/sum, ww3=w3/sum;
      const p10 = clamp(x.P10_no, 1e-3, 1-1e-3); const p5 = clamp(x.P5_no,1e-3,1-1e-3); const p3 = clamp(x.P3_no,1e-3,1-1e-3);
      const p10w = clamp(x.P10_with ?? p10,1e-3,1-1e-3); const p5w=clamp(x.P5_with ?? p5,1e-3,1-1e-3); const p3w=clamp(x.P3_with ?? p3,1e-3,1-1e-3);
      const baseLogit = ww10*logit(p10) + ww5*logit(p5) + ww3*logit(p3);
      let dH2H = ww10*(logit(p10w)-logit(p10)) + ww5*(logit(p5w)-logit(p5)) + ww3*(logit(p3w)-logit(p3));
      dH2H = clamp(dH2H, -W.C_H2H, W.C_H2H);
      const beta = W.beta||[0,0,0,0];
      const z = baseLogit
        + (W.lambda_h2h||0)*dH2H
        + (beta[0]||0)*((x.STAB_A||0)-(x.STAB_B||0))/100
        + (beta[1]||0)*((x.EXT_A||0)-(x.EXT_B||0))/100
        - (beta[2]||0)*Math.abs(x.Sgap||0)
        - (beta[3]||0)*(x.UpsetRadar?1:0);
      const p_raw = sig(z);
      const disp_no = clamp(Math.abs((x.P10_no||0.5) - 0.5), 0, 0.5)/0.5; // 0..1
      const shrink = (1 - (W.rho_disp||0)*disp_no) * (x.UpsetRadar ? (W.phi_upset||1) : 1);
      return clamp(0.5 + (p_raw - 0.5) * shrink, 0.05, 0.95);
    } catch(_) { return 0.5; }
  }

  function computeTB35(x, T){
    try {
      const a=T; const z = (a.a0||0)
        + (a.a1||0)*(((x.EXT_A||0)+(x.EXT_B||0))/2)
        + (a.a2||0)*Math.min(x.STAB_A||0, x.STAB_B||0)
        + (a.a3||0)*(x.TieBreakRate_pair||0)
        + (a.a4||0)*(x.FracSets4_5_pair||0)
        - (a.a5||0)*Math.abs(x.Sgap||0)
        - (a.a6||0)*(x.DryRate_pair||0)
        - (a.a7||0)*Math.abs((x.EXT_A||0)-(x.EXT_B||0))
        + (a.a8||0)*((x.CoinFlip)?1:0)
        - (a.a9||0)*((x.RecentSweep)?1:0)
        - (a.a10||0)*(x.ScoreSkew||0);
      return clamp(sig(z), 0.05, 0.95);
    } catch(_) { return 0.5; }
  }

  function predictWinnerAndTB(x, meta){
    const M = meta || loadMetaParams();
    const pML = computeWinner(x, M.winner);
    const pTB = computeTB35(x, M.tb35);
    const corr = clamp((M.coupling?.kappa||0.2) * (0.5 - Math.abs(pML - 0.5)), 0, 0.25);
    const P_ML_final = clamp(pML * (1 - corr), 0.01, 0.99);
    const P_TB_final = clamp(pTB + corr * (1 - pTB), 0.01, 0.99);
    return { P_ML_final, P_TB_final, corr, key: M.key };
  }

  // ===== Two-sets verdict v5 (weights + adjustments) =====
  function computeTwoSetsVerdict_v5(input){
    try {
      const {
        favName = 'Фаворит',
        undName = 'Аутсайдер',
        prob_noBT = 0,
        prob_h2h = 0,
        prob_log = 0,
        prob_form = 0,
        fci = 0,
        sum = null,
        trend = 0,
        markov_score = ''
      } = input || {};

      // Base (percent scale)
      let base = 0
        + 0.28 * (Number(prob_noBT) || 0)
        + 0.25 * (Number(prob_form) || 0)
        + 0.22 * (Number(fci) || 0)
        + 0.15 * (Number(prob_h2h) || 0)
        + 0.10 * (Number(prob_log) || 0);

      // Adjustments (percent scale)
      let adj = 0;
      if (sum != null && Number(sum) < 50) adj -= 5;
      if (Number(trend) < -10) adj -= 5;
      if (Math.abs((Number(prob_noBT)||0) - (Number(prob_log)||0)) > 20) adj -= 5;
      if (["3:0","3:1","3:2"].includes(String(markov_score))) adj += 4; else adj -= 6;

      let scorePct = Math.max(0, Math.min(100, base + adj));
      let score = scorePct / 100; // 0..1

      // Verdict thresholds (optimized):
      let verdict;
      if (score >= 0.70) verdict = '✅ GO';
      else if (score >= 0.60) verdict = '🟢 MID';
      else if (score >= 0.53) verdict = '🟡 RISK';
      else verdict = '🔴 PASS';

      // Mirror mode (underdog +1.5) if favorite weak
      const underdogHasSignal = (
        (100 - (Number(prob_noBT)||0)) >= 60 ||
        (100 - (Number(prob_log)||0)) >= 55 ||
        (Number(trend) <= -10)
      );
      let stake = `🏆 ${favName}`;
      if (score < 0.45 && underdogHasSignal) {
        verdict = '🟢 GO';
        stake = `🚩 ${undName}`;
      }

      return { score: +score.toFixed(2), scorePct: Math.round(score*100), verdict, stake };
    } catch(_) {
      return { score: 0.5, scorePct: 50, verdict: '🟡 RISK', stake: `🏆 ${input?.favName||'Фаворит'}` };
    }
  }

  window.MetaCalib = { loadMetaParams, predictWinnerAndTB, computeWinner, computeTB35, computeTwoSetsVerdict_v5 };
})();
