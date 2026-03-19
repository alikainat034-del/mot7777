/**
 * MOT777 — Live Game Server
 * Works on Railway, Render, VPS, cPanel
 * 
 * npm install
 * node server.js
 */

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const crypto    = require('crypto');

// ── APP SETUP (must be first) ─────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ADMIN ACCOUNTS ────────────────────────────────────────────
const adminAccounts = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    role: 'superadmin',
    name: 'Super Admin',
    createdBy: null,
    createdAt: new Date().toISOString()
  }
];
let adminIdCtr = 2;

// User accounts
const userAccounts = [
  { id: 1, name: 'Ali Khan',   email: 'ali@test.com',  password: '1234', balance: 15000, status: 'active', joined: '2025-01-10', bets: 0 },
  { id: 2, name: 'Sara Ahmed', email: 'sara@test.com', password: '1234', balance: 3200,  status: 'active', joined: '2025-02-14', bets: 0 }
];
let userIdCtr = 3;

function verifyAdmin(u, p) {
  return adminAccounts.find(a => a.username === u && a.password === p) || null;
}

// ── ADMIN API ─────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const a = verifyAdmin(username, password);
  if (!a) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ success: true, admin: { id: a.id, username: a.username, role: a.role, name: a.name } });
});

app.post('/api/admin/create', (req, res) => {
  const { creatorUsername, creatorPassword, newUsername, newPassword, newName, role } = req.body || {};
  const creator = verifyAdmin(creatorUsername, creatorPassword);
  if (!creator) return res.status(401).json({ error: 'Unauthorized' });
  if (!['superadmin','admin'].includes(creator.role)) return res.status(403).json({ error: 'No permission' });
  if (!newUsername || !newPassword) return res.status(400).json({ error: 'Username and password required' });
  if (adminAccounts.find(a => a.username === newUsername)) return res.status(400).json({ error: 'Username already exists' });
  const newAdmin = {
    id: adminIdCtr++,
    username: newUsername,
    password: newPassword,
    role: role === 'superadmin' ? 'superadmin' : 'admin',
    name: newName || newUsername,
    createdBy: creator.username,
    createdAt: new Date().toISOString()
  };
  adminAccounts.push(newAdmin);
  console.log(`[ADMIN] Created: ${newUsername} by ${creator.username}`);
  res.json({ success: true, admin: { id: newAdmin.id, username: newAdmin.username, role: newAdmin.role, name: newAdmin.name } });
});

app.get('/api/admin/list', (req, res) => {
  const a = verifyAdmin(req.query.username, req.query.password);
  if (!a) return res.status(401).json({ error: 'Unauthorized' });
  res.json(adminAccounts.map(x => ({ id: x.id, username: x.username, role: x.role, name: x.name, createdBy: x.createdBy, createdAt: x.createdAt })));
});

app.delete('/api/admin/:id', (req, res) => {
  const { username, password } = req.body || {};
  const a = verifyAdmin(username, password);
  if (!a || a.role !== 'superadmin') return res.status(403).json({ error: 'Only superadmin can delete admins' });
  const idx = adminAccounts.findIndex(x => x.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });
  if (adminAccounts[idx].role === 'superadmin') return res.status(403).json({ error: 'Cannot delete superadmin' });
  adminAccounts.splice(idx, 1);
  res.json({ success: true });
});

// ── USER API ──────────────────────────────────────────────────
app.post('/api/users/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = userAccounts.find(x => x.email === email && x.password === password);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  if (u.status === 'banned') return res.status(403).json({ error: 'Account banned' });
  const { password: _p, ...safe } = u;
  res.json({ success: true, user: safe });
});

app.get('/api/users', (req, res) => {
  if (!verifyAdmin(req.query.username, req.query.password)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(userAccounts.map(({ password: _p, ...u }) => u));
});

app.post('/api/users/create', (req, res) => {
  const { username, password, name, email, userPassword, balance } = req.body || {};
  if (!verifyAdmin(username, password)) return res.status(401).json({ error: 'Unauthorized' });
  if (!name || !email || !userPassword) return res.status(400).json({ error: 'Name, email, password required' });
  if (userAccounts.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });
  const u = { id: userIdCtr++, name, email, password: userPassword, balance: Number(balance) || 0, status: 'active', joined: new Date().toISOString().slice(0, 10), bets: 0 };
  userAccounts.push(u);
  const { password: _p, ...safe } = u;
  res.json({ success: true, user: safe });
});

app.post('/api/users/balance', (req, res) => {
  const { username, password, userId, amount, action } = req.body || {};
  if (!verifyAdmin(username, password)) return res.status(401).json({ error: 'Unauthorized' });
  const u = userAccounts.find(x => x.id === userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const amt = Number(amount);
  if (action === 'add') u.balance += amt;
  else if (action === 'deduct') {
    if (amt > u.balance) return res.status(400).json({ error: 'Insufficient balance' });
    u.balance -= amt;
  }
  res.json({ success: true, newBalance: u.balance });
});

app.post('/api/users/status', (req, res) => {
  const { username, password, userId, status } = req.body || {};
  if (!verifyAdmin(username, password)) return res.status(401).json({ error: 'Unauthorized' });
  const u = userAccounts.find(x => x.id === userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.status = status;
  res.json({ success: true });
});

// ── CARD ENGINE ───────────────────────────────────────────────
const SUITS  = ['♠','♥','♦','♣'];
const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_V = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};

function mkDeck() {
  return SUITS.flatMap(s => RANKS.map(r => ({ s, r, red: s==='♥'||s==='♦' })));
}
function shuffle(d) {
  const a = [...d];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function evalHand(cards) {
  const avail = cards.filter(c => c && c.up !== false);
  if (avail.length < 5) return { rank: 0, name: '—' };
  let best = { rank: -1, name: '' };
  function combos(arr, k) {
    const res = [];
    function go(s, cur) {
      if (cur.length===k) { res.push([...cur]); return; }
      for (let i=s; i<=arr.length-k+cur.length; i++) { cur.push(arr[i]); go(i+1,cur); cur.pop(); }
    }
    go(0,[]);
    return res;
  }
  combos(avail, 5).forEach(h => {
    const vs = h.map(c=>RANK_V[c.r]).sort((a,b)=>b-a);
    const ss = h.map(c=>c.s);
    const fl = ss.every(s=>s===ss[0]);
    const uniq = [...new Set(vs)];
    const str = (uniq.length===5&&vs[0]-vs[4]===4) || (uniq.length===5&&vs[0]===14&&vs[1]===5&&vs[2]===4&&vs[3]===3&&vs[4]===2);
    const cnts = Object.values(vs.reduce((o,v)=>{o[v]=(o[v]||0)+1;return o},{})).sort((a,b)=>b-a);
    let rank=0, name='High Card';
    if(fl&&str){rank=8;name='Straight Flush';}
    else if(cnts[0]===4){rank=7;name='Four of a Kind';}
    else if(cnts[0]===3&&cnts[1]===2){rank=6;name='Full House';}
    else if(fl){rank=5;name='Flush';}
    else if(str){rank=4;name='Straight';}
    else if(cnts[0]===3){rank=3;name='Three of a Kind';}
    else if(cnts[0]===2&&cnts[1]===2){rank=2;name='Two Pair';}
    else if(cnts[0]===2){rank=1;name='One Pair';}
    if(rank > best.rank) best = {rank, name};
  });
  return best;
}
function calcOdds(hands, comm) {
  const rh = hands.map(h => h.map(c=>({...c,up:true})));
  const ranks = rh.map((h,i) => ({ i, ev: evalHand([...h,...comm]) }));
  const best = Math.max(...ranks.map(r=>r.ev.rank));
  return ranks.map(r => {
    const diff = best - r.ev.rank;
    const base = diff===0 ? 2.0+(Math.random()-.5)*.4
                : diff===1 ? 3.5+(Math.random()-.5)*.6
                : diff===2 ? 6.5+(Math.random()-.5)*1.0
                : 13.0+(Math.random()-.5)*3.0;
    return parseFloat(base.toFixed(2));
  });
}

const rf = (a,b) => parseFloat((a+Math.random()*(b-a)).toFixed(2));
const ri = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
let roundId = 10000000;
const newRid = () => ++roundId;

// ── PHASE DURATIONS ───────────────────────────────────────────
const DUR = { wait:8, pre:20, flop:20, turn:20, river:20, result:6 };

// ── CREATE GAME STATES ────────────────────────────────────────
function mkHoldem() {
  const deck = shuffle(mkDeck());
  return {
    gid: newRid(), phase:'wait', timer:DUR.wait, deck,
    hands: [
      [{...deck[0],up:false},{...deck[1],up:false}],
      [{...deck[2],up:false},{...deck[3],up:false}],
      [{...deck[4],up:false},{...deck[5],up:false}],
      [{...deck[6],up:false},{...deck[7],up:false}]
    ],
    comm: [],
    commFull: [deck[8],deck[9],deck[10],deck[11],deck[12]],
    odds: [rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2)],
    sizes: [ri(400,2000),ri(400,2000),ri(400,2000),ri(400,2000)],
    extraOdds: {fh:rf(3,5),flush:rf(4,7),str:rf(3.5,5),tok:rf(6,9),two:rf(3.5,5.5)},
    winner: null, results: [], bets: []
  };
}
function mkBac() {
  const deck = shuffle(mkDeck());
  function bv(cards) { return cards.reduce((s,c)=>(s+(['10','J','Q','K'].includes(c.r)?0:c.r==='A'?1:parseInt(c.r)))%10,0); }
  const p=[deck[0],deck[2]], b=[deck[1],deck[3]];
  const p3=bv(p)<=5?deck[4]:null, b3=bv(b)<=5?(p3?deck[5]:deck[4]):null;
  return {
    gid:newRid(), phase:'wait', timer:DUR.wait,
    pH:[{...deck[0],up:false},{...deck[2],up:false},...(p3?[{...p3,up:false}]:[])],
    bH:[{...deck[1],up:false},{...deck[3],up:false},...(b3?[{...b3,up:false}]:[])],
    pHFull:[{...deck[0],up:true},{...deck[2],up:true},...(p3?[{...p3,up:true}]:[])],
    bHFull:[{...deck[1],up:true},{...deck[3],up:true},...(b3?[{...b3,up:true}]:[])],
    odds:{p:1.98,b:1.93,t:10.0,pp:11.0,bp:11.0},
    winner:null, results:[], bets:[]
  };
}
function mkHiLo() {
  const deck = shuffle(mkDeck());
  return {
    gid:newRid(), phase:'wait', timer:DUR.wait,
    c1:{...deck[0],up:false}, c2:{...deck[1],up:false},
    c1Full:{...deck[0],up:true}, c2Full:{...deck[1],up:true},
    odds:{hi:rf(1.8,2.2),lo:rf(1.8,2.2),eq:rf(10,16)},
    outcome:null, results:[], bets:[]
  };
}
const HN = ['Thunder Road','Silver Arrow','Night Dancer','Golden Flame','Desert Wind','Lucky Star'];
const HJ = ['F. Dettori','W. Buick','R. Moore','J. Spencer','P. Hanagan','T. Queally'];
function mkDerby() {
  return {
    gid:newRid(), phase:'wait', timer:DUR.wait,
    positions:[0,0,0,0,0,0],
    speeds:[rf(.8,1.4),rf(.8,1.4),rf(.8,1.4),rf(.8,1.4),rf(.8,1.4),rf(.8,1.4)],
    raceOrder:[], targetPct:0,
    odds:HN.map(()=>rf(2,10)),
    winner:null, results:[], bets:[]
  };
}

// ── GAME STATE STORE ──────────────────────────────────────────
const G = {
  holdem:       mkHoldem(),
  turbo_holdem: mkHoldem(),
  blackjack:    mkHoldem(),
  turbo_bj:     mkHoldem(),
  baccarat:     mkBac(),
  turbo_bac:    mkBac(),
  hilo:         mkHiLo(),
  turbo_hilo:   mkHiLo(),
  omaha:        mkHoldem(),
  derby:        mkDerby(),
  turbo_derby:  mkDerby()
};

// ── SPORTS DATA ───────────────────────────────────────────────
const COURSES   = ['Ascot','Newmarket','Cheltenham','Goodwood','York','Sandown','Kempton'];
const GREYHOUND = ['Crayford','Romford','Wimbledon','Swindon','Oxford','Monmore'];
const FB_TEAMS  = {
  'Premier League':['Arsenal','Chelsea','Liverpool','Man City','Man Utd','Tottenham','Aston Villa','Newcastle'],
  'La Liga':['Real Madrid','Barcelona','Atletico Madrid','Sevilla','Valencia'],
  'Bundesliga':['Bayern Munich','B. Dortmund','RB Leipzig','Leverkusen'],
  'Serie A':['Juventus','AC Milan','Inter Milan','Napoli','Roma']
};
const CRICKET = ['India','England','Australia','Pakistan','South Africa','New Zealand'];
const TENNIS  = ['Djokovic','Alcaraz','Sinner','Medvedev','Swiatek','Sabalenka','Rybakina','Zverev'];
const GOLF    = ['Scheffler','McIlroy','Rahm','Schauffele','Hovland','Morikawa','Cantlay','Fleetwood'];

function rOdds(base) {
  const b = +base;
  return {
    backs:[{p:+(b*1.08).toFixed(2),s:ri(50,1000)},{p:+(b*1.04).toFixed(2),s:ri(200,3000)},{p:+b.toFixed(2),s:ri(500,8000)}],
    lays: [{p:+(b+.02).toFixed(2),s:ri(400,6000)},{p:+(b*1.04+.02).toFixed(2),s:ri(200,3000)},{p:+(b*1.08+.02).toFixed(2),s:ri(50,1000)}]
  };
}
let eid = 1000000;
function buildSports() {
  const hrRaces=[], grRaces=[], fbMatches=[], tnMatches=[], crMatches=[], golfTournaments=[];
  const HORSE_NAMES=['Thunder Road','Silver Arrow','Night Dancer','Golden Flame','Desert Wind','Lucky Star','Royal Flash','Iron Duke','Crystal Clear','Dark Warrior','Bright Hope','Wild Spirit','Moon Shadow','Star Light'];
  const JOCKEYS=['F. Dettori','W. Buick','R. Moore','J. Spencer','P. Hanagan'];
  COURSES.forEach((v,vi)=>{
    ['13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'].forEach((t,ti)=>{
      const status=ti===0&&vi<3?'inplay':'upcoming';
      const runners=Array.from({length:ri(6,12)},(_,i)=>{
        const base=i===0?rf(1.5,4):i<3?rf(3,8):rf(10,40);
        return{id:eid++,name:HORSE_NAMES[i%14],jockey:JOCKEYS[i%5],trainer:'J. Gosden',draw:i+1,form:Array.from({length:5},()=>['W','2','3','F','U'][ri(0,4)]),sp:base.toFixed(1),odds:rOdds(base),ltp:base.toFixed(1),matched:ri(200,50000),color:['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'][i%8]};
      });
      hrRaces.push({id:eid++,venue:v,time:t,status,distance:['5f','6f','7f','1m','1m2f'][ri(0,4)],going:['Good','Firm','Soft'][ri(0,2)],runners,matched:ri(50000,2000000),prize:'£'+ri(5000,200000).toLocaleString()});
    });
  });
  GREYHOUND.forEach((v,vi)=>{
    ['18:00','18:17','18:34','18:51','19:08','19:25'].forEach((t,ti)=>{
      const runners=Array.from({length:6},(_,i)=>{const base=rf(1.8,12);return{id:eid++,name:['Rapid Fire','Blue Steel','Gold Jet','Night Flash','Sprint King','Ace Runner'][i],trap:i+1,form:Array.from({length:5},()=>String(ri(1,6))),sp:base.toFixed(1),odds:rOdds(base),ltp:base.toFixed(1),matched:ri(100,10000),color:['#e74c3c','#3498db','#fff','#000','#f39c12','#000080'][i]};});
      grRaces.push({id:eid++,venue:v,time:t,status:ti===0&&vi<3?'inplay':'upcoming',distance:'480m',grade:'A'+ri(1,6),runners,matched:ri(5000,200000)});
    });
  });
  Object.entries(FB_TEAMS).forEach(([league,teams])=>{
    for(let i=0;i<teams.length-1;i+=2){
      const status=i<4?'inplay':'prematch';
      const b1=rf(1.5,3.5),bd=rf(3,4.5),b2=rf(2,6);
      fbMatches.push({id:eid++,team1:teams[i],team2:teams[i+1],league,status,score:status==='inplay'?`${ri(0,3)}-${ri(0,3)}`:'0-0',minute:status==='inplay'?ri(1,85):0,markets:[{id:eid++,name:'Match Odds',runners:[{id:eid++,name:teams[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(5000,200000)},{id:eid++,name:'Draw',odds:rOdds(bd),ltp:bd.toFixed(2),matched:ri(2000,80000)},{id:eid++,name:teams[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(4000,150000)}],matched:ri(20000,500000)},{id:eid++,name:'Over/Under 2.5',runners:[{id:eid++,name:'Over 2.5',odds:rOdds(rf(1.7,2.5)),ltp:'1.90',matched:ri(3000,80000)},{id:eid++,name:'Under 2.5',odds:rOdds(rf(1.6,2.2)),ltp:'1.95',matched:ri(2000,60000)}],matched:ri(10000,200000)},{id:eid++,name:'Both Teams to Score',runners:[{id:eid++,name:'Yes',odds:rOdds(rf(1.6,2.2)),ltp:'1.85',matched:ri(2000,50000)},{id:eid++,name:'No',odds:rOdds(rf(1.8,2.8)),ltp:'2.10',matched:ri(1000,40000)}],matched:ri(8000,150000)}],matched:ri(50000,2000000)});
    }
  });
  for(let i=0;i<TENNIS.length-1;i+=2){const b1=rf(1.3,3.5),b2=rf(1.3,3.5);tnMatches.push({id:eid++,team1:TENNIS[i],team2:TENNIS[i+1],league:['Wimbledon','US Open','ATP Tour'][ri(0,2)],status:i<4?'inplay':'prematch',score:i<4?`${ri(0,2)}-${ri(0,2)}`:'',markets:[{id:eid++,name:'Match Odds',runners:[{id:eid++,name:TENNIS[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(3000,100000)},{id:eid++,name:TENNIS[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(3000,100000)}],matched:ri(10000,300000)}],matched:ri(50000,1000000)});}
  for(let i=0;i<CRICKET.length-1;i+=2){const b1=rf(1.4,3),b2=rf(1.4,3);crMatches.push({id:eid++,team1:CRICKET[i],team2:CRICKET[i+1],league:['IPL','T20 WC','Test'][ri(0,2)],status:i<2?'inplay':'prematch',score:i<2?`${CRICKET[i]}: ${ri(80,280)}/${ri(2,8)} (${ri(10,45)} ov)`:'',markets:[{id:eid++,name:'Match Odds',runners:[{id:eid++,name:CRICKET[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(5000,200000)},{id:eid++,name:'Draw',odds:rOdds(15),ltp:'15.0',matched:ri(500,30000)},{id:eid++,name:CRICKET[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(5000,200000)}],matched:ri(20000,800000)}],matched:ri(100000,5000000)});}
  ['The Masters','US Open Golf','The Open Championship'].forEach(name=>{golfTournaments.push({id:eid++,name,runners:GOLF.map((p,i)=>({id:eid++,name:p,odds:rOdds(i<3?rf(5,12):rf(15,100)),ltp:(i<3?rf(6,10):rf(20,80)).toFixed(1),matched:ri(500,50000)})),matched:ri(100000,2000000)});});
  return{hrRaces,grRaces,fbMatches,tnMatches,crMatches,golfTournaments};
}
let sportsData = buildSports();
setInterval(()=>{ sportsData = buildSports(); }, 180000);

// ── PHASE TRANSITIONS ─────────────────────────────────────────
function tickHoldem(s, key) {
  switch(s.phase) {
    case 'wait':
      Object.assign(s, mkHoldem());
      s.phase='pre'; s.timer=DUR.pre;
      break;
    case 'pre':
      s.phase='flop'; s.timer=DUR.flop;
      s.comm=[{...s.commFull[0],up:true},{...s.commFull[1],up:true},{...s.commFull[2],up:true}];
      s.hands=s.hands.map(h=>h.map(c=>({...c,up:true})));
      s.odds=calcOdds(s.hands,s.comm);
      s.sizes=[ri(300,2000),ri(300,2000),ri(300,2000),ri(300,2000)];
      break;
    case 'flop':
      s.phase='turn'; s.timer=DUR.turn;
      s.comm=[...s.comm,{...s.commFull[3],up:true}];
      s.odds=calcOdds(s.hands,s.comm);
      s.sizes=[ri(200,1500),ri(200,1500),ri(200,1500),ri(200,1500)];
      break;
    case 'turn':
      s.phase='river'; s.timer=DUR.river;
      s.comm=[...s.comm,{...s.commFull[4],up:true}];
      s.odds=calcOdds(s.hands,s.comm);
      s.sizes=[ri(100,800),ri(100,800),ri(100,800),ri(100,800)];
      break;
    case 'river':
      s.phase='result'; s.timer=DUR.result;
      const ranked=s.hands.map((h,i)=>({i,ev:evalHand([...h,...s.comm])})).sort((a,b)=>b.ev.rank-a.ev.rank);
      s.winner=ranked[0];
      settleBets(s);
      s.results=[{gid:s.gid,winner:s.winner,time:new Date().toLocaleTimeString()},...s.results].slice(0,20);
      break;
    case 'result':
      s.phase='wait'; s.timer=DUR.wait; break;
  }
}
function tickBac(s) {
  function bv(c){return c.reduce((t,x)=>(t+(['10','J','Q','K'].includes(x.r)?0:x.r==='A'?1:parseInt(x.r)))%10,0);}
  switch(s.phase) {
    case 'wait': Object.assign(s,mkBac()); s.phase='pre'; s.timer=DUR.pre; break;
    case 'pre':
      s.phase='flop'; s.timer=DUR.flop;
      s.pH[0]={...s.pHFull[0],up:true}; s.bH[0]={...s.bHFull[0],up:true}; break;
    case 'flop':
      s.phase='turn'; s.timer=DUR.turn;
      s.pH=s.pHFull.map(c=>({...c,up:true})); s.bH=s.bHFull.map(c=>({...c,up:true}));
      const pv=bv(s.pHFull),bvv=bv(s.bHFull);
      s.odds={p:pv>bvv?rf(1.4,1.7):rf(2.2,2.8),b:bvv>pv?rf(1.4,1.7):rf(2.2,2.8),t:pv===bvv?rf(4,7):rf(9,12),pp:rf(9,13),bp:rf(9,13)}; break;
    case 'turn': s.phase='river'; s.timer=DUR.river; break;
    case 'river':
      s.phase='result'; s.timer=DUR.result;
      const pf=s.pHFull,bf=s.bHFull;
      const pvf=bv(pf),bvf=bv(bf);
      const ppair=pf[0].r===pf[1].r,bpair=bf[0].r===bf[1].r;
      s.winner={w:pvf>bvf?'player':bvf>pvf?'banker':'tie',pv:pvf,bv:bvf,ppair,bpair};
      settleBacBets(s);
      s.results=[{gid:s.gid,...s.winner,time:new Date().toLocaleTimeString()},...s.results].slice(0,20); break;
    case 'result': s.phase='wait'; s.timer=DUR.wait; break;
  }
}
function tickHiLo(s) {
  switch(s.phase) {
    case 'wait': Object.assign(s,mkHiLo()); s.phase='pre'; s.timer=DUR.pre; break;
    case 'pre': s.phase='flop'; s.timer=DUR.flop; s.c1={...s.c1Full,up:true}; break;
    case 'flop': s.phase='turn'; s.timer=DUR.turn; break;
    case 'turn': s.phase='river'; s.timer=DUR.river; break;
    case 'river':
      s.phase='result'; s.timer=DUR.result;
      s.c2={...s.c2Full,up:true};
      const v1=RANK_V[s.c1Full.r],v2=RANK_V[s.c2Full.r];
      s.outcome={res:v2>v1?'hi':v2<v1?'lo':'eq',v1,v2};
      settleHLBets(s);
      s.results=[{gid:s.gid,...s.outcome,time:new Date().toLocaleTimeString()},...s.results].slice(0,20); break;
    case 'result': s.phase='wait'; s.timer=DUR.wait; break;
  }
}
function tickDerby(s) {
  switch(s.phase) {
    case 'wait': Object.assign(s,mkDerby()); s.phase='pre'; s.timer=DUR.pre; break;
    case 'pre': s.phase='flop'; s.timer=DUR.flop; s.targetPct=33; break;
    case 'flop': s.phase='turn'; s.timer=DUR.turn; s.targetPct=66; break;
    case 'turn': s.phase='river'; s.timer=DUR.river; s.targetPct=100; break;
    case 'river':
      s.phase='result'; s.timer=DUR.result;
      s.positions=[100,100,100,100,100,100];
      if(!s.raceOrder.length){s.raceOrder=[...Array(6)].map((_,i)=>i).sort(()=>Math.random()-.5);}
      s.winner=s.raceOrder[0];
      settleDerbyBets(s);
      s.results=[{gid:s.gid,winner:s.winner,name:HN[s.winner],time:new Date().toLocaleTimeString()},...s.results].slice(0,20); break;
    case 'result': s.phase='wait'; s.timer=DUR.wait; break;
  }
}

// ── SETTLEMENT ────────────────────────────────────────────────
function settleBets(s) {
  const w=s.winner;
  s.bets.forEach(b=>{
    if(b.settled)return; b.settled=true;
    let won=false;
    if(b.market==='hand'){won=b.type==='back'?w.i===b.handIdx:w.i!==b.handIdx;}
    else{const wr=w.ev.rank;
      if(b.runner==='Winner has FH or better')won=b.type==='back'?wr>=6:wr<6;
      else if(b.runner==='Winner has Flush')won=b.type==='back'?wr===5:wr!==5;
      else if(b.runner==='Winner has Straight')won=b.type==='back'?wr===4:wr!==4;
      else if(b.runner==='Winner has Three of a Kind')won=b.type==='back'?wr===3:wr!==3;
      else if(b.runner==='Winner has Two Pair or worse')won=b.type==='back'?wr<=2:wr>2;
    }
    b.won=won; b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);
  });
}
function settleBacBets(s){const w=s.winner;s.bets.forEach(b=>{if(b.settled)return;b.settled=true;let won=false;if(b.runner==='Player')won=b.type==='back'?w.w==='player':w.w!=='player';else if(b.runner==='Banker')won=b.type==='back'?w.w==='banker':w.w!=='banker';else if(b.runner==='Tie')won=b.type==='back'?w.w==='tie':w.w!=='tie';else if(b.runner==='Player Pair')won=b.type==='back'?w.ppair:!w.ppair;else if(b.runner==='Banker Pair')won=b.type==='back'?w.bpair:!w.bpair;b.won=won;b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);});}
function settleHLBets(s){const res=s.outcome.res;s.bets.forEach(b=>{if(b.settled)return;b.settled=true;let won=false;if(b.runner==='Higher')won=b.type==='back'?res==='hi':res!=='hi';else if(b.runner==='Lower')won=b.type==='back'?res==='lo':res!=='lo';else if(b.runner==='Equal')won=b.type==='back'?res==='eq':res!=='eq';b.won=won;b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);});}
function settleDerbyBets(s){const w=s.raceOrder[0];s.bets.forEach(b=>{if(b.settled)return;b.settled=true;const hi=parseInt(b.runner.replace('Horse ',''))-1;const won=b.type==='back'?w===hi:w!==hi;b.won=won;b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);});}

// ── RACE ANIMATION ────────────────────────────────────────────
setInterval(()=>{
  ['derby','turbo_derby'].forEach(key=>{
    const s=G[key];
    if(!['flop','turn','river'].includes(s.phase))return;
    const fin=new Set(s.raceOrder);
    let moved=false;
    for(let i=0;i<6;i++){
      if(!fin.has(i)&&s.positions[i]<s.targetPct){
        s.positions[i]=Math.min(s.targetPct,s.positions[i]+s.speeds[i]*rf(.5,2));
        s.speeds[i]=Math.max(.5,s.speeds[i]+rf(-.03,.03));
        moved=true;
        if(s.positions[i]>=s.targetPct){s.raceOrder.push(i);fin.add(i);}
      }
    }
    if(moved)broadcast(key,{type:'positions',positions:s.positions,raceOrder:s.raceOrder});
  });
},100);

// ── ODDS FLUCTUATION ─────────────────────────────────────────
setInterval(()=>{
  // Sports odds
  sportsData.hrRaces.forEach(r=>r.runners.forEach(rn=>{const nb=Math.max(1.02,+(parseFloat(rn.ltp)+(Math.random()-.5)*.1).toFixed(2));rn.odds=rOdds(nb);rn.ltp=nb.toFixed(2);}));
  sportsData.fbMatches.forEach(m=>{m.markets.forEach(mk=>mk.runners.forEach(r=>{const nb=Math.max(1.02,+(parseFloat(r.ltp)+(Math.random()-.5)*.08).toFixed(2));r.odds=rOdds(nb);r.ltp=nb.toFixed(2);}));if(m.status==='inplay')m.minute=Math.min(90,(m.minute||0)+(Math.random()<.3?1:0));});
  broadcastSports();
  // Game odds during betting
  Object.entries(G).forEach(([key,s])=>{
    if(!['pre','flop','turn','river'].includes(s.phase))return;
    if(['holdem','turbo_holdem','blackjack','turbo_bj','omaha'].includes(key)){s.odds=s.odds.map(o=>Math.max(1.3,+(o+(Math.random()-.5)*.1).toFixed(2)));broadcast(key,{type:'odds',odds:s.odds,sizes:s.sizes,extraOdds:s.extraOdds});}
    if(['baccarat','turbo_bac'].includes(key)){s.odds={p:Math.max(1.4,+(s.odds.p+(Math.random()-.5)*.05).toFixed(2)),b:Math.max(1.4,+(s.odds.b+(Math.random()-.5)*.05).toFixed(2)),t:Math.max(7,+(s.odds.t+(Math.random()-.5)*.3).toFixed(2)),pp:Math.max(8,+(s.odds.pp+(Math.random()-.5)*.4).toFixed(2)),bp:Math.max(8,+(s.odds.bp+(Math.random()-.5)*.4).toFixed(2))};broadcast(key,{type:'odds',odds:s.odds});}
    if(['hilo','turbo_hilo'].includes(key)){s.odds={hi:Math.max(1.4,+(s.odds.hi+(Math.random()-.5)*.1).toFixed(2)),lo:Math.max(1.4,+(s.odds.lo+(Math.random()-.5)*.1).toFixed(2)),eq:Math.max(7,+(s.odds.eq+(Math.random()-.5)*.4).toFixed(2))};broadcast(key,{type:'odds',odds:s.odds});}
    if(['derby','turbo_derby'].includes(key)){s.odds=s.odds.map(o=>Math.max(1.3,+(o+(Math.random()-.5)*.25).toFixed(2)));broadcast(key,{type:'odds',odds:s.odds});}
  });
},2500);

// ── MAIN 1-SECOND TICK ────────────────────────────────────────
setInterval(()=>{
  Object.entries(G).forEach(([key,s])=>{
    s.timer--;
    if(s.timer<=0){
      if(['holdem','turbo_holdem','blackjack','turbo_bj','omaha'].includes(key))tickHoldem(s,key);
      else if(['baccarat','turbo_bac'].includes(key))tickBac(s);
      else if(['hilo','turbo_hilo'].includes(key))tickHiLo(s);
      else if(['derby','turbo_derby'].includes(key))tickDerby(s);
      broadcastState(key);
    } else {
      broadcast(key,{type:'timer',timer:s.timer,phase:s.phase});
    }
  });
},1000);

// ── BROADCAST ────────────────────────────────────────────────
function broadcast(gameKey, data) {
  const msg = JSON.stringify({game:gameKey,...data});
  wss.clients.forEach(ws=>{ if(ws.readyState===WebSocket.OPEN) ws.send(msg); });
}
function broadcastState(gameKey) {
  const {deck,commFull,bets,...safe} = G[gameKey];
  const msg = JSON.stringify({type:'state',game:gameKey,state:safe});
  wss.clients.forEach(ws=>{ if(ws.readyState===WebSocket.OPEN) ws.send(msg); });
}
function broadcastSports() {
  const msg = JSON.stringify({type:'sports',data:sportsData});
  wss.clients.forEach(ws=>{ if(ws.readyState===WebSocket.OPEN) ws.send(msg); });
}

// ── WEBSOCKET ─────────────────────────────────────────────────
wss.on('connection', ws => {
  console.log(`[WS] Client connected. Total: ${wss.clients.size}`);
  // Send full state of all games to new client
  Object.keys(G).forEach(key => {
    const {deck,commFull,bets,...safe} = G[key];
    ws.send(JSON.stringify({type:'state',game:key,state:safe}));
  });
  ws.send(JSON.stringify({type:'sports',data:sportsData}));

  ws.on('message', raw => {
    let msg;
    try{ msg=JSON.parse(raw); }catch(e){ return; }
    if(msg.type==='bet'){
      const s=G[msg.game];
      if(!s)return;
      if(!['pre','flop','turn','river'].includes(s.phase)){ws.send(JSON.stringify({type:'bet_rejected',reason:'Betting is closed'}));return;}
      const bet={id:crypto.randomUUID(),userId:msg.userId,runner:msg.runner,type:msg.betType,odds:msg.odds,stake:msg.stake,market:msg.market,handIdx:msg.handIdx,settled:false,won:null,payout:0,placedAt:new Date().toISOString()};
      s.bets.push(bet);
      ws.send(JSON.stringify({type:'bet_confirmed',betId:bet.id,bet}));
    }
    if(msg.type==='ping') ws.send(JSON.stringify({type:'pong'}));
  });

  ws.on('close', ()=>console.log(`[WS] Client left. Total: ${wss.clients.size}`));
  ws.on('error', e=>console.log('[WS] Error:',e.message));
});

// ── REST ──────────────────────────────────────────────────────
app.get('/api/state',   (req,res)=>{const out={};Object.entries(G).forEach(([k,v])=>{const{deck,commFull,bets,...s}=v;out[k]=s;});res.json(out);});
app.get('/api/sports',  (req,res)=>res.json(sportsData));
app.get('/health',      (req,res)=>res.json({status:'ok',clients:wss.clients.size,uptime:Math.floor(process.uptime()),games:Object.keys(G).length}));

// ── START ─────────────────────────────────────────────────────
server.listen(PORT, ()=>{
  console.log(`\n🎰 MOT777 Server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ${Object.keys(G).length} live games | Admin: /admin.html\n`);
});
