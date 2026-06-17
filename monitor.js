// ============================================================
//  BTC Terminal — 24/7 Monitor  (runs free on GitHub Actions)
//  Aapke coins har run par check karta hai aur ZAROORI alerts
//  aapke phone par ntfy.sh ke zariye bhejta hai (iPhone + Watch).
//  Koi external library nahi — Node 20 ka built-in fetch.
//  YAAD RAHE: alerts "kuch ho raha hai" batate hain, profit nahi.
// ============================================================
const fs = require('fs');

// ---------- CONFIG (chahein to badlein) ----------
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';   // GitHub secret se aata hai
const COINS = ['BTC','ETH','XRP','SOL','ADA','LINK','LTC','AVAX','NEAR','DOT','DOGE','SHIB','PEPE','BONK','WIF'];
const BAR = '30m';
const MOVE_PCT = 3;          // bada move (%) ek bar mein
const RSI_HI = 75, RSI_LO = 25;
const VOL_MULT = 2.5;        // volume spike = average ka itna guna
const COOLDOWN_MS = 2 * 3600 * 1000;  // ek hi alert 2 ghante mein dobara nahi
const STATE_FILE = 'state.json';

// ---------- helpers ----------
async function getCandles(sym){
  const okxBar = {'30m':'30m','1h':'1H','15m':'15m'}[BAR] || '30m';
  try{
    const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT&bar=${okxBar}&limit=60`);
    if(r.ok){const j = await r.json(); if(j && j.data && j.data.length){
      return j.data.map(a=>({t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5]})).reverse();
    }}
  }catch(e){}
  try{
    const r = await fetch(`https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=${sym}_USDT&timeframe=${BAR}&count=60`);
    if(r.ok){const j = await r.json(); const d = j && j.result && j.result.data; if(d && d.length){
      return d.map(a=>({t:+a.t,o:+a.o,h:+a.h,l:+a.l,c:+a.c,v:+a.v}));
    }}
  }catch(e){}
  return null;
}
function rsi(closes, p=14){
  if(closes.length < p+1) return null;
  let g=0,l=0;
  for(let i=closes.length-p;i<closes.length;i++){const d=closes[i]-closes[i-1]; if(d>=0)g+=d; else l-=d;}
  const ag=g/p, al=l/p; if(al===0) return 100;
  return 100 - 100/(1 + ag/al);
}
function fmtPx(v){const a=Math.abs(v); if(a>=1000)return v.toFixed(0); if(a>=1)return v.toFixed(2); if(a>=0.01)return v.toFixed(4); return v.toPrecision(3);}
async function push(title, body, priority, tag){
  if(!NTFY_TOPIC){console.log('NTFY_TOPIC set nahi hai — secret add karein.'); return;}
  try{
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`,{method:'POST',headers:{Title:title,Priority:priority||'default',Tags:tag||''},body});
    console.log('pushed:', title);
  }catch(e){console.log('push failed:', e.message);}
}

// ---------- state (taake ek hi alert baar baar na aaye) ----------
let state={};
try{ state = JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); }catch(e){ state={}; }
const now = Date.now();
const canFire = k => !state[k] || (now - state[k]) > COOLDOWN_MS;
const mark = k => { state[k]=now; };

(async ()=>{
  const alerts=[];
  for(const sym of COINS){
    const c = await getCandles(sym);
    if(!c || c.length < 25) { console.log(sym,'data skip'); continue; }
    const closes = c.map(x=>x.c);
    const last = c[c.length-1], prev = c[c.length-2];
    const movePct = prev.c ? (last.c - prev.c)/prev.c*100 : 0;
    const win = c.slice(-21,-1);
    const rh = Math.max(...win.map(x=>x.h)), rl = Math.min(...win.map(x=>x.l));
    const vavg = win.reduce((s,x)=>s+x.v,0)/win.length;
    const r = rsi(closes,14);

    if(Math.abs(movePct) >= MOVE_PCT && canFire(sym+':move')){
      mark(sym+':move'); alerts.push({t:`${sym} ${movePct>=0?'+':''}${movePct.toFixed(1)}% (30m)`, b:`Price $${fmtPx(last.c)} — bada move.`, p:'high', tag: movePct>=0?'rocket':'chart_with_downwards_trend'});
    }
    if(last.c > rh && canFire(sym+':breakout')){
      mark(sym+':breakout'); alerts.push({t:`${sym} breakout`, b:`20-bar high $${fmtPx(rh)} ke upar band (ab $${fmtPx(last.c)}). Volume confirm karo.`, p:'high', tag:'arrow_up_small'});
    } else if(last.c < rl && canFire(sym+':breakdown')){
      mark(sym+':breakdown'); alerts.push({t:`${sym} breakdown`, b:`20-bar low $${fmtPx(rl)} ke neeche band (ab $${fmtPx(last.c)}).`, p:'high', tag:'arrow_down_small'});
    }
    if(vavg>0 && last.v >= vavg*VOL_MULT && canFire(sym+':vol')){
      mark(sym+':vol'); alerts.push({t:`${sym} volume spike`, b:`Last bar ${(last.v/vavg).toFixed(1)}x average volume. Activity badh rahi.`, p:'default', tag:'loudspeaker'});
    }
    if(r!=null && r>=RSI_HI && canFire(sym+':rsihi')){
      mark(sym+':rsihi'); alerts.push({t:`${sym} RSI ${r.toFixed(0)} overbought`, b:`Exhaustion/chase risk.`, p:'default', tag:'warning'});
    } else if(r!=null && r<=RSI_LO && canFire(sym+':rsilo')){
      mark(sym+':rsilo'); alerts.push({t:`${sym} RSI ${r.toFixed(0)} oversold`, b:`Bounce zone — confirm karo.`, p:'default', tag:'warning'});
    }
  }
  for(const a of alerts){ await push(a.t, a.b, a.p, a.tag); }
  console.log(alerts.length ? `${alerts.length} alert(s) bheje` : 'is run mein koi naya alert nahi');
  for(const k in state){ if(now - state[k] > 7*864e5) delete state[k]; }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
})();
