// Committee-based decision logic for favorite win rules
// Exposes window.Committee with decide() and helpers

(function(global){
  const EPS = 1e-9;

  function clamp(x, a, b){ return Math.min(b, Math.max(a, Number(x)||0)); }
  function clamp01(x){ return clamp(x, 0, 1); }
  function logit(p){ const pp = clamp01(p); const q = 1-pp; return Math.log((pp+EPS)/(q+EPS)); }
  function sigmoid(z){ return 1/(1+Math.exp(-z)); }

  // 1) Committee aggregation (weights can be adapted via online learning)
  function committeeProb(pScore, pBT, pH2H, pExt, W){
    const w = W || { w0:0, w1:0.9, w2:0.6, w3:0.3, w4:0.4 };
    const x = (w.w0||0)
      + (w.w1||0)*logit(clamp01(pScore))
      + (w.w2||0)*logit(clamp01(pBT))
      + (w.w3||0)*logit(clamp01(pH2H))
      + (w.w4||0)*logit(clamp01(pExt));
    return sigmoid(x);
  }

  // 2) Temperature calibration
  function calibrate(p, T){ const t = (T==null? 1.0 : Number(T)); return sigmoid(logit(clamp01(p))/Math.max(0.1, t||1)); }

  // 3) Consensus/conflict metrics
  function consensusStats(arr){
    const xs = (arr||[]).map(v=>clamp01(v));
    if (!xs.length) return {R:0, K:0};
    const max = Math.max(...xs), min = Math.min(...xs);
    const R = max - min;
    let s=0, k=0; for(let i=0;i<xs.length;i++){ for(let j=i+1;j<xs.length;j++){ s += Math.abs(xs[i]-xs[j]); k++; } }
    const C = k? (s/k) : 0;
    const K = 1 - C; // 0..1
    return { R, K };
  }

  function mean(arr){ if(!arr||!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length; }
  function stddev01(arr){
    const xs = (arr||[]).map(v=>clamp01(v));
    if (!xs.length) return 0;
    const m = mean(xs);
    const v = xs.reduce((s,x)=>s + (x-m)*(x-m), 0) / xs.length;
    return Math.sqrt(Math.max(0,v));
  }

  function valueScore(pCal, q, U){ return (clamp01(pCal) - clamp01(q)) * clamp01(U); }

  // 6) Bootstrap uncertainty — approximate using beta resampling around each input
  function betaSample(a, b){
    // Cheng’s algorithm approximation via gamma sampling
    // Fall back to normal approx if needed
    function gamma(k){
      const KK = Math.max(k, 1e-3);
      // Marsaglia-Tsang for k>1, boost small k
      const d = KK - 1/3, c = 1/Math.sqrt(9*d);
      let x, v;
      for(;;){
        x = gaussian();
        v = 1 + c*x; if (v <= 0) continue; v = v*v*v; const u = Math.random();
        if (u < 1 - 0.0331*(x*x)*(x*x)) break;
        if (Math.log(u) < 0.5*x*x + d*(1 - v + Math.log(v))) break;
      }
      return d*v;
    }
    function gaussian(){
      // Box-Muller
      let u = 0, v = 0; while (u===0) u = Math.random(); while (v===0) v = Math.random();
      return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
    }
    const ga = gamma(Math.max(a, 1e-3));
    const gb = gamma(Math.max(b, 1e-3));
    return ga/(ga+gb);
  }

  function approxCounts(p, nEff){
    const p1 = clamp01(p); const n = Math.max(1, Math.round(nEff||10));
    const alpha = 1 + p1 * n;
    const beta = 1 + (1 - p1) * n;
    return { alpha, beta };
  }

  function sigmaBootstrap(pScore, pBT, pH2H, pExt, W, T, n=200, nEff={}){
    const eff = Object.assign({ score:12, bt:20, h2h:10, ext:8 }, nEff||{});
    const cScore = approxCounts(pScore, eff.score);
    const cBT    = approxCounts(pBT, eff.bt);
    const cH2H   = approxCounts(pH2H, eff.h2h);
    const cExt   = approxCounts(pExt, eff.ext);
    const vals = [];
    for(let i=0;i<n;i++){
      const s = betaSample(cScore.alpha, cScore.beta);
      const b = betaSample(cBT.alpha, cBT.beta);
      const h = betaSample(cH2H.alpha, cH2H.beta);
      const e = betaSample(cExt.alpha, cExt.beta);
      const pc = committeeProb(s,b,h,e,W);
      vals.push(calibrate(pc, T));
    }
    const m = vals.reduce((a,b)=>a+b,0)/vals.length;
    const v = vals.reduce((a,b)=>a + (b-m)*(b-m),0)/Math.max(1, vals.length-1);
    return Math.sqrt(Math.max(0,v));
  }

  function decide(pScore, pBT, pH2H, pExt, q, opts){
    const O = Object.assign({
      W: { w0:0, w1:0.9, w2:0.6, w3:0.3, w4:0.4 },
      T: 1.0,
      sigmaHat: null,
      nBoot: 200,
      nEff: undefined
    }, opts || {});

    const probs = [pScore, pBT, pH2H, pExt].map(x=>clamp01(x));
    const committee = committeeProb(probs[0], probs[1], probs[2], probs[3], O.W);
    const pCal = calibrate(committee, O.T);
    // Disagreement penalty: shrink probability toward 0.5 when models diverge
    const s = stddev01(probs); // 0..~0.5
    const varPenalty = 1 - Math.min(s / 0.25, 1); // 1 (agree) -> 0 (high disagreement)
    const pAdj = 0.5 + (pCal - 0.5) * varPenalty;
    const {R,K} = consensusStats(probs);
    const sigmaHat = (O.sigmaHat!=null) ? O.sigmaHat : sigmaBootstrap(probs[0], probs[1], probs[2], probs[3], O.W, O.T, O.nBoot, O.nEff);
    const U = clamp01(K) * (1 - clamp01(R)) * (1 - clamp01(sigmaHat));
    const value = valueScore(pAdj, q, U);

    // Sign conflict rule (BT vs Score)
    const signConflict = ((pBT-0.5)*(pScore-0.5) < 0) && (Math.abs(pBT - pScore) >= 0.12);

    // Hard thresholds
    if (R>0.25 || K<0.55 || sigmaHat>0.07 || signConflict) {
      return { verdict: 'NO BET', p: pAdj, value, K, R, U, sigmaHat, details:{signConflict, varPenalty} };
    }
    if (R>0.15 || K<0.68) {
      return { verdict: 'LEAN', p: pAdj, value, K, R, U, sigmaHat, details:{signConflict, varPenalty} };
    }

    // Bet with color by Value
    let color = 'YELLOW';
    if (value <= 0) color = 'RED';
    else if (value >= 0.03) color = 'GREEN';

    return { verdict: 'BET', color, p: pAdj, value, K, R, U, sigmaHat, details:{signConflict, varPenalty} };
  }

  // Confidence metric for UI
  function confidencePct(K, R, sigmaHat){
    const c = 0.5*clamp01(K) + 0.3*(1 - clamp01(R)) + 0.2*(1 - clamp01(sigmaHat));
    return Math.round(100*clamp01(c));
  }

  const api = { committeeProb, calibrate, consensusStats, valueScore, sigmaBootstrap, decide, confidencePct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Committee = api;
})(typeof window !== 'undefined' ? window : globalThis);
