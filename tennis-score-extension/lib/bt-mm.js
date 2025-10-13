// Simple Bradley–Terry (Hunter MM) on match outcomes only
// Exposes window.BTMM with computeTop3Scores and helpers

(function(){
  function clamp01(x){ return Math.min(1-1e-9, Math.max(1e-9, Number(x)||0)); }

  class BradleyTerryMM {
    constructor({maxIter=10000, tol=1e-10, l2=0.0}={}){
      this.maxIter = maxIter; this.tol = tol; this.l2 = l2;
      this.players = []; this.pi = {};
    }
    fit(matches){
      // matches: array of [winner, loser]
      const wins = new Map();
      const n_ij = new Map();
      const players = new Set();
      const touch = (i,j) => {
        if(!n_ij.has(i)) n_ij.set(i, new Map());
        const row = n_ij.get(i); if(!row.has(j)) row.set(j, 0);
      };
      for(const m of (matches||[])){
        const w = String(m[0]||'').trim();
        const l = String(m[1]||'').trim();
        if(!w || !l || w===l) continue;
        wins.set(w, (wins.get(w)||0) + 1);
        touch(w,l); touch(l,w);
        n_ij.get(w).set(l, (n_ij.get(w).get(l)||0) + 1);
        players.add(w); players.add(l);
      }
      this.players = Array.from(players).sort();
      const pi = {}; this.players.forEach(p=>pi[p]=1.0);

      for(let it=0; it<this.maxIter; it++){
        let maxDelta = 0;
        const denom = {};
        for(const i of this.players){
          let s = 0.0;
          const row = n_ij.get(i)||new Map();
          for(const [j,n] of row){ if(n>0){ s += n / (pi[i] + pi[j]); } }
          if(this.l2>0) s += this.l2*2.0;
          denom[i] = s;
        }
        for(const i of this.players){
          let wi = wins.get(i)||0;
          if(this.l2>0) wi += this.l2*2.0*1.0; // pull toward 1.0
          const di = denom[i];
          const newPi = di>0 ? (wi/di) : pi[i];
          const np = Math.max(newPi, 1e-15);
          maxDelta = Math.max(maxDelta, Math.abs(np - pi[i]));
          pi[i] = np;
        }
        if(maxDelta < this.tol) break;
      }
      // normalize
      let s = 0; for(const k in pi) s += pi[k]; if(s>0){ for(const k in pi) pi[k]/=s; }
      this.pi = pi; return this;
    }
    probMatchWin(A,B){
      if(!(A in this.pi) || !(B in this.pi)) return 0.5;
      const a = this.pi[A], b = this.pi[B];
      return a/(a+b);
    }
  }

  function matchWinProbBestOfK(p, k=3){
    p = clamp01(p); const q = 1-p; let total = 0;
    for(let r=0;r<k;r++){
      // C((k-1)+r, r) * p^k * q^r
      const comb = nCr((k-1)+r, r);
      total += comb * Math.pow(p,k) * Math.pow(q,r);
    }
    return total;
  }
  function invertMatchProbToSetProb(target, k=3, tol=1e-9, maxIter=200){
    let lo = 1e-6, hi = 1-1e-6; target = clamp01(target);
    for(let it=0; it<maxIter; it++){
      const mid = 0.5*(lo+hi);
      const val = matchWinProbBestOfK(mid,k);
      if(Math.abs(val-target)<tol) return mid;
      if(val<target) lo = mid; else hi = mid;
    }
    return 0.5*(lo+hi);
  }
  function scoreDistBo5(p){
    p = clamp01(p); const q = 1-p; const C=nCr;
    return {
      '3:0': Math.pow(p,3),
      '3:1': C(3,1)*Math.pow(p,3)*q,
      '3:2': C(4,2)*Math.pow(p,3)*Math.pow(q,2),
      '0:3': Math.pow(q,3),
      '1:3': C(3,1)*Math.pow(q,3)*p,
      '2:3': C(4,2)*Math.pow(q,3)*Math.pow(p,2),
    };
  }
  function nCr(n,r){ if(r<0||r>n) return 0; r=Math.min(r,n-r); let num=1,den=1; for(let i=1;i<=r;i++){ num*= (n-(r-i)); den*=i; } return num/den; }

  function computeTop3Scores(p1, p2, last10_p1, last10_p2, h2h10, {l2=1e-3}={}){
    // inputs: arrays of [winner, loser]
    const mm = new BradleyTerryMM({l2});
    const data = [...(last10_p1||[]), ...(last10_p2||[]), ...(h2h10||[])];
    mm.fit(data);
    const pMatch = mm.probMatchWin(p1,p2);
    const pSet = invertMatchProbToSetProb(pMatch, 3);
    const dist = scoreDistBo5(pSet);
    const entries = Object.entries(dist).map(([score,prob])=>({score, probability: prob})).sort((a,b)=>b.probability-a.probability);
    return { p_match: pMatch, p_set: pSet, dist, top3: entries.slice(0,3) };
  }

  window.BTMM = { BradleyTerryMM, computeTop3Scores, matchWinProbBestOfK, invertMatchProbToSetProb, scoreDistBo5 };
})();

