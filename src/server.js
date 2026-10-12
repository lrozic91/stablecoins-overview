// ---- Web stranica: rute ----
// GET /, /radar, /prinosi, /wallet  -> HTML stranice
// GET /api/...                       -> podaci (JSON), dohvaćeni na poslužitelju
// Tajne varijable Workera: RPC_URL (Helius, za Solanu) i BLOCKSCOUT_KEY (za EVM mreže; bez njega koriste se javni Blockscout exploreri).

const BS_INSTANCES = {
  "1": "https://eth.blockscout.com",
  "8453": "https://base.blockscout.com",
  "42161": "https://arbitrum.blockscout.com",
  "4663": "https://robinhoodchain.blockscout.com",
};

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ISSUE = "0xcb8241adb0c3fdb35b70c24ce35c5eb0c17af7431c99f827d44a445ca624176a";
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const RADAR_CHAINS = [
  { key: "eth", id: "1", rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://eth.llamarpc.com", "https://1rpc.io/eth", "https://cloudflare-eth.com"], blockTime: 12, chunk: 2000, issue: "0xdac17f958d2ee523a2206206994597c13d831ec7", tokens: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6], "0xdc035d45d973e3ec169d2276ddab16f1e407384f": ["USDS", 18],
    "0x6b175474e89094c44da98b954eedeac495271d0f": ["DAI", 18], "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": ["USDe", 18],
    "0x6c3ea9036406852006290770bedfcaba0e23a0e8": ["PYUSD", 6], "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": ["USD1", 18],
    "0x8292bb45bf1ee4d140127049757c2e0ff06317ed": ["RLUSD", 18], "0xe343167631d89b6ffc58b88d6b7fb0228795491d": ["USDG", 6],
    "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c": ["EURC", 6], "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6] } },
  { key: "base", id: "8453", rpcFirst: true, envRpc: "BASE_RPC_URL", rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org", "https://1rpc.io/base"], blockTime: 2, chunk: 450, tokens: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": ["USDC", 6], "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": ["EURC", 6],
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "arb", id: "42161", rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://1rpc.io/arb"], blockTime: 0.25, chunk: 10000, tokens: {
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": ["USDC", 6], "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": ["USD₮0", 6],
    "0x46850ad61c2b7d64d08c9c754f45254596696984": ["PYUSD", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "hood", id: "4663", rpcs: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com", "https://robinhood.drpc.org", "https://rpc.arrowrpc.com"], chunk: 5000, tokens: {
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": ["USDG", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18],
    "0xce24439f2d9c6a2289f741120fe202248b666666": ["U", 18] } },
];
const RADAR_WINDOW_S = 2100; // 35 min: malo više od razmaka automatskih provjera (30 min), da se ništa ne propusti

// Blockscout, sučelje kompatibilno s Etherscanom. Vraća polje result ili baca grešku.
// S ključem prvo pita PRO API; ako on za neku mrežu ne uspije, pokuša javni explorer te mreže.
async function blockscout(env, chainid, params) {
  if (env.BLOCKSCOUT_KEY) {
    const q = new URLSearchParams(params);
    q.set("chainid", chainid); q.set("apikey", env.BLOCKSCOUT_KEY);
    try { return await blockscoutGet("https://api.blockscout.com/v2/api?" + q); }
    catch (e) {
      if (!BS_INSTANCES[chainid]) throw e;
      try { return await blockscoutGet(BS_INSTANCES[chainid] + "/api?" + new URLSearchParams(params)); }
      catch (e2) { throw new Error("PRO: " + String(e.message || e).slice(0, 120) + " | " + String(e2.message || e2).slice(0, 80)); }
    }
  }
  if (!BS_INSTANCES[chainid]) throw new Error("Unsupported chain " + chainid);
  return blockscoutGet(BS_INSTANCES[chainid] + "/api?" + new URLSearchParams(params));
}

// Javni RPC čvorovi: mintanja se čitaju izravno iz čvora, bez Blockscouta (koji Workere često ograniči ili blokira).
async function rpcCall(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error("RPC HTTP " + r.status + ": " + t.slice(0, 160)); }
  if (j.error) throw new Error("RPC: " + (j.error.message || JSON.stringify(j.error)).slice(0, 160));
  if (j.result === undefined || j.result === null) throw new Error("RPC HTTP " + r.status + ": " + t.slice(0, 160));
  return j.result;
}

// Isti poziv redom na svaki čvor s popisa, dok jedan ne uspije. Grešku zbog prevelikog raspona blokova vraća odmah.
const RANGE_ERR = /range|too many|exceed|query returned more|block.*limit|limit.*block/i;
// Čvorovi se pitaju počevši od nasumičnog, da se opterećenje rasporedi; nakon kruga bez uspjeha kratka pauza i još jedan krug.
async function rpcAny(c, method, params, budget) {
  let last;
  const pub = c.rpcs.slice(c.privRpc ? 1 : 0), k = Math.floor(Math.random() * pub.length);
  const order = [...(c.privRpc ? [c.rpcs[0]] : []), ...pub.slice(k), ...pub.slice(0, k)];
  for (let round = 0; round < 2; round++) for (const [i, url] of order.entries()) {
    if (round && !i) await sleep(900);
    if (budget.used >= budget.max) throw new Error("Previše upita u jednoj provjeri" + (budget.last ? " (zadnja greška: " + budget.last + ")" : ""));
    budget.used++;
    try { return await rpcCall(url, method, params); }
    catch (e) {
      last = e; budget.last = String(e.message || e).slice(0, 120);
      if (method === "eth_getLogs" && RANGE_ERR.test(String(e.message)) && !/rate/i.test(String(e.message))) throw e;
    }
  }
  throw last;
}

// Logovi za raspon; ako čvor javi da je raspon prevelik, raspon se dijeli na pola.
async function getLogsSplit(c, filter, from, to, budget, out) {
  try {
    const res = await rpcAny(c, "eth_getLogs", [{ ...filter, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }], budget);
    if (!Array.isArray(res)) throw new Error("RPC: neočekivan odgovor");
    out.push(...res);
  } catch (e) {
    if (to - from < 50 || !RANGE_ERR.test(String(e.message))) throw e;
    const mid = Math.floor((from + to) / 2);
    await getLogsSplit(c, filter, from, mid, budget, out);
    await getLogsSplit(c, filter, mid + 1, to, budget, out);
  }
}

async function blockInfo(c, n, budget) {
  const b = await rpcAny(c, "eth_getBlockByNumber", [typeof n === "number" ? "0x" + n.toString(16) : n, false], budget);
  return { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16) };
}

async function radarChainRpc(c, shared, env) {
  // Vlastiti RPC (tajna varijabla, npr. BASE_RPC_URL s Infura ili Alchemy ključem) ide prvi, prije javnih čvorova.
  if (c.envRpc && env && env[c.envRpc]) c = { ...c, rpcs: [env[c.envRpc], ...c.rpcs], privRpc: true };
  // Zajednički brojač za sve mreže: Cloudflare (besplatni plan) dopušta najviše 50 vanjskih poziva po zahtjevu.
  const budget = shared;
  const head = await blockInfo(c, "latest", budget);
  // Vrijeme bloka: poznato za veće mreže; za ostale procjena iz zadnjih 100 blokova (stariji blokovi traže arhivski čvor).
  let bt = c.blockTime;
  if (!bt) { const probe = await blockInfo(c, Math.max(0, head.n - 100), budget); bt = Math.max(0.05, (head.t - probe.t) / Math.max(1, head.n - probe.n)); }
  const start = { n: Math.max(0, head.n - Math.ceil(RADAR_WINDOW_S / bt)) };
  start.t = head.t - (head.n - start.n) * bt;
  // Vrijeme bloka procijenjeno između prvog i zadnjeg bloka prozora, da ne treba poziv po bloku.
  const tsOf = (b) => start.t + (b - start.n) * (head.t - start.t) / Math.max(1, head.n - start.n);
  const filters = [{ address: Object.keys(c.tokens), topics: [TRANSFER, ZERO32], issue: false }];
  if (c.issue) filters.push({ address: c.issue, topics: [ISSUE], issue: true });
  const mints = [];
  for (const f of filters) {
    const logs = [];
    for (let from = start.n; from <= head.n; from += c.chunk) {
      await getLogsSplit(c, { address: f.address, topics: f.topics }, from, Math.min(head.n, from + c.chunk - 1), budget, logs);
    }
    for (const lg of logs) {
      const tok = f.issue ? ["USDT", 6] : c.tokens[String(lg.address).toLowerCase()];
      if (!tok) continue;
      let raw;
      try { raw = BigInt(lg.data && lg.data !== "0x" ? lg.data.slice(0, 66) : "0x0"); } catch { continue; }
      const amt = Number(raw) / Math.pow(10, tok[1]);
      if (!(amt > 0)) continue;
      const b = parseInt(lg.blockNumber, 16);
      const to = !f.issue && lg.topics && lg.topics[2] ? "0x" + lg.topics[2].slice(26) : "";
      mints.push({ id: c.key + ":" + lg.transactionHash + ":" + parseInt(lg.logIndex, 16), sym: tok[0], amt, to, tx: lg.transactionHash, ts: Math.round(tsOf(b)), blk: b });
    }
  }
  return { ok: true, block: head.n, mints, warnings: [] };
}

async function blockscoutGet(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "stablecoini-web/1.0" }, signal: AbortSignal.timeout(10000) });
    if (r.status === 429 && attempt < 2) { await sleep(1200); continue; }
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); } catch { throw new Error("Blockscout HTTP " + r.status + ": " + t.slice(0, 160)); }
    if (Array.isArray(j.result)) return j.result;
    if (/no (records|transactions|logs|token transfers)/i.test((j.message || "") + " " + (typeof j.result === "string" ? j.result : ""))) return [];
    if (j.result !== undefined && j.result !== null && j.status === "1") return j.result;
    if (/rate limit/i.test(t) && attempt < 2) { await sleep(1500); continue; }
    throw new Error("Blockscout HTTP " + r.status + ": " + t.slice(0, 200));
  }
}

const hexOrDec = (v) => (typeof v === "string" && v.startsWith("0x") ? parseInt(v, 16) : Number(v));

async function radarChain(env, c) {
  const since = Math.floor(Date.now() / 1000) - RADAR_WINDOW_S;
  const blk = await blockscout(env, c.id, { module: "block", action: "getblocknobytime", timestamp: String(since), closest: "after" });
  const fromBlock = String(typeof blk === "object" && blk ? blk.blockNumber : blk);
  const jobs = Object.keys(c.tokens).map((a) => ({ address: a, topic0: TRANSFER, topic1: ZERO32, topic0_1_opr: "and", tok: c.tokens[a], issue: false }));
  if (c.issue) jobs.push({ address: c.issue, topic0: ISSUE, topic1: "", topic0_1_opr: "", tok: ["USDT", 6], issue: true });
  const mints = [], failed = [];
  let latest = Number(fromBlock) || 0;
  for (const j of jobs) {
    const p = { module: "logs", action: "getLogs", fromBlock, toBlock: "latest", address: j.address, topic0: j.topic0 };
    if (j.topic1) { p.topic1 = j.topic1; p.topic0_1_opr = j.topic0_1_opr; }
    let rows;
    try { rows = await blockscout(env, c.id, p); }
    catch (e) { failed.push(j.tok[0] + ": " + String(e.message || e).slice(0, 120)); continue; }
    for (const lg of rows) {
      const b = hexOrDec(lg.blockNumber);
      if (b > latest) latest = b;
      let raw;
      try { raw = BigInt(lg.data && lg.data !== "0x" ? lg.data.slice(0, 66) : "0x0"); } catch { continue; }
      const amt = Number(raw) / Math.pow(10, j.tok[1]);
      if (!(amt > 0)) continue;
      const to = !j.issue && lg.topics && lg.topics[2] ? "0x" + lg.topics[2].slice(26) : "";
      mints.push({ id: c.key + ":" + lg.transactionHash + ":" + hexOrDec(lg.logIndex), sym: j.tok[0], amt, to, tx: lg.transactionHash, ts: hexOrDec(lg.timeStamp), blk: b });
    }
    await sleep(220);
  }
  if (failed.length === jobs.length) throw new Error(failed[0]);
  return { ok: true, block: latest, mints, warnings: failed };
}

// Kratka memorija u Workeru: posjetitelji unutar istog intervala dijele isti rezultat.
const MEMO = new Map();
async function memo(key, ttlMs, fn) {
  const hit = MEMO.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p;
  const p = fn();
  MEMO.set(key, { at: Date.now(), p });
  p.catch(() => MEMO.delete(key));
  if (MEMO.size > 500) MEMO.delete(MEMO.keys().next().value);
  return p;
}

// Rok za jednu mrežu, da jedan spori izvor ne zadrži cijeli odgovor.
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("Izvor nije odgovorio na vrijeme (" + ms / 1000 + " s)")), ms))]);
}

async function apiRadarEvm(env, only) {
  const out = { updated: new Date().toISOString(), window_s: RADAR_WINDOW_S, chains: {} };
  // Mreže se provjeravaju istovremeno, da odgovor ne čeka zbroj svih čekanja.
  const shared = { used: 0, max: 44 };
  await Promise.all(RADAR_CHAINS.filter((c) => !only || c.key === only).map(async (c) => {
    // S ključem BLOCKSCOUT_KEY koristi se Blockscout PRO API (pouzdan); bez njega javni RPC čvorovi,
    // koji Cloudflare Workere često ograniče jer dijele iste IP adrese.
    // Base u besplatnom Blockscout PRO planu nije dostupan, pa uvijek ide preko RPC-a. Ako prvi način ne uspije, pokuša se drugi.
    const first = env.BLOCKSCOUT_KEY && !c.rpcFirst ? () => radarChain(env, c) : () => radarChainRpc(c, shared, env);
    const second = env.BLOCKSCOUT_KEY && !c.rpcFirst ? () => radarChainRpc(c, shared, env) : env.BLOCKSCOUT_KEY ? () => radarChain(env, c) : null;
    try { out.chains[c.key] = await withTimeout(first(), 20000); }
    catch (e) {
      try { if (!second) throw e; out.chains[c.key] = await withTimeout(second(), 15000); }
      catch (e2) { out.chains[c.key] = { ok: false, err: String((e && e.message) || e).slice(0, 120) + (e2 !== e ? " | " + String((e2 && e2.message) || e2).slice(0, 80) : "") }; }
    }
  }));
  // Mintanja manja od 1.000 $ se ne šalju (najmanji prag na stranici je 1.000), da odgovor ostane malen.
  for (const v of Object.values(out.chains)) if (v.mints) v.mints = v.mints.filter((m) => m.amt >= 1000);
  return out;
}

async function apiRadarSol(env) {
  const d = await getMints(env, { limit_per_token: 3 });
  const cutoff = Date.now() / 1000 - RADAR_WINDOW_S;
  return {
    updated: new Date().toISOString(), slot: d.slot,
    mints: d.mints.filter((m) => !m.time || m.time >= cutoff).map((m) => ({ id: "sol:" + m.signature + ":" + m.index, sym: m.symbol, amt: m.amount, to: m.to, tx: m.signature, ts: m.time, blk: m.slot })),
  };
}

async function apiEvmTransfers(env, url) {
  const chain = url.searchParams.get("chain") || "";
  const address = (url.searchParams.get("address") || "").toLowerCase();
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!BS_INSTANCES[chain]) throw new HttpError(400, "Nepoznata mreža / Unknown network.");
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new HttpError(400, "Neispravna adresa / Invalid address.");
  if (contract && !/^0x[0-9a-f]{40}$/.test(contract)) throw new HttpError(400, "Neispravan ugovor / Invalid contract.");
  const p = { module: "account", action: "tokentx", address, page: "1", offset: "1000", sort: "desc" };
  if (contract) p.contractaddress = contract;
  const result = await blockscout(env, chain, p);
  return { result };
}

// ---- Wallet checker: dozvole za trošenje i zamrznute adrese ----
const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
// Funkcije kojima izdavatelji provjeravaju blokiranu adresu: Circle (USDC, EURC), Tether (USDT), Paxos (PYUSD, USDG), USDT0.
const FREEZE_FNS = [["0xfe575a87", "Circle"], ["0xe47d6060", "Tether"], ["0xe5839836", "Paxos"], ["0xfbac3951", "USDT0"]];
const SAFETY_RPCS = Object.fromEntries(RADAR_CHAINS.map((c) => [c.id, c.rpcs]));
const pad32 = (a) => "0x" + a.replace(/^0x/, "").toLowerCase().padStart(64, "0");

// Više eth_call poziva u jednom zahtjevu (JSON-RPC batch); čvor koji ne podržava batch preskače se.
async function rpcBatch(rpcs, calls) {
  // Javni čvorovi ograničavaju veličinu batcha, pa se šalje u dijelovima od 40 poziva.
  if (calls.length > 40) {
    const out = [];
    for (let i = 0; i < calls.length; i += 40) out.push(...await rpcBatch(rpcs, calls.slice(i, i + 40)));
    return out;
  }
  if (!calls.length) return [];
  const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
  let last;
  for (const url of rpcs) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error("RPC: batch nije podržan");
      const out = new Array(calls.length).fill(null);
      for (const x of j) if (x && typeof x.id === "number" && typeof x.result === "string" && x.result.length >= 66) out[x.id] = x.result;
      return out;
    } catch (e) { last = e; }
  }
  throw last || new Error("RPC nije odgovorio");
}

async function apiEvmSafety(env, url) {
  const chain = url.searchParams.get("chain") || "";
  const address = (url.searchParams.get("address") || "").toLowerCase();
  const tokens = (url.searchParams.get("tokens") || "").toLowerCase().split(",").filter((t) => /^0x[0-9a-f]{40}$/.test(t)).slice(0, 15);
  if (!BS_INSTANCES[chain] || !SAFETY_RPCS[chain]) throw new HttpError(400, "Nepoznata mreža / Unknown network.");
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new HttpError(400, "Neispravna adresa / Invalid address.");
  const rpcs = (chain === "8453" && env.BASE_RPC_URL ? [env.BASE_RPC_URL] : []).concat(SAFETY_RPCS[chain]);

  // 1) Zadnja Approval poruka za svaki par (token, ovlašteni ugovor).
  const latest = new Map();
  let failed = 0;
  for (const token of tokens) {
    let rows;
    try {
      rows = await blockscout(env, chain, { module: "logs", action: "getLogs", fromBlock: "0", toBlock: "latest", address: token, topic0: APPROVAL, topic1: pad32(address), topic0_1_opr: "and" });
    } catch (e) { failed++; continue; }
    for (const lg of rows) {
      if (!lg.topics || !lg.topics[2]) continue;
      const spender = "0x" + lg.topics[2].slice(26).toLowerCase();
      const key = token + ":" + spender, b = hexOrDec(lg.blockNumber), li = hexOrDec(lg.logIndex) || 0;
      const prev = latest.get(key);
      if (!prev || b > prev.b || (b === prev.b && li > prev.li)) latest.set(key, { token, spender, b, li, ts: hexOrDec(lg.timeStamp), tx: lg.transactionHash });
    }
    await sleep(150);
  }
  if (tokens.length && failed === tokens.length) throw new Error("Blockscout nije vratio dozvole");

  // 2) Trenutni iznos svake dozvole, decimale tokena i provjera blokade, sve u jednom batch pozivu.
  const pairs = [...latest.values()].slice(0, 60);
  const calls = [];
  for (const p of pairs) calls.push({ to: p.token, data: "0xdd62ed3e" + pad32(address).slice(2) + pad32(p.spender).slice(2) });
  const decTokens = [...new Set(pairs.map((p) => p.token))];
  for (const t of decTokens) calls.push({ to: t, data: "0x313ce567" });
  const freezeCalls = [];
  for (const t of tokens) for (const [sel, who] of FREEZE_FNS) { freezeCalls.push({ token: t, who }); calls.push({ to: t, data: sel + pad32(address).slice(2) }); }
  const res = await rpcBatch(rpcs, calls);

  const dec = {};
  decTokens.forEach((t, i) => { const v = res[pairs.length + i]; dec[t] = v ? Number(BigInt(v.slice(0, 66))) : null; });
  const approvals = [];
  pairs.forEach((p, i) => {
    const v = res[i];
    if (!v) return;
    const raw = BigInt(v.slice(0, 66));
    if (raw === 0n) return;
    const unlimited = raw >= 2n ** 128n;
    const d = dec[p.token];
    approvals.push({ token: p.token, spender: p.spender, unlimited, amount: unlimited || d == null ? null : Number(raw) / Math.pow(10, d), ts: p.ts, tx: p.tx });
  });
  const frozen = {};
  freezeCalls.forEach((f, i) => {
    const v = res[pairs.length + decTokens.length + i];
    if (!v) return;
    const isFrozen = BigInt(v.slice(0, 66)) === 1n;
    frozen[f.token] = { issuer: f.who, frozen: isFrozen || (frozen[f.token] && frozen[f.token].frozen) || false };
  });
  return { approvals, frozen, checked: tokens.length, failed };
}

// Solana: zamrznuti tokenski računi i delegati (dozvole) za stablecoine, iz Helius RPC-a.
async function apiSolSafety(env, url) {
  const addr = String(url.searchParams.get("address") || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) throw new HttpError(400, "Neispravna adresa / Invalid address.");
  if (!env.RPC_URL) throw new Error("Nedostaje RPC_URL");
  const out = { approvals: [], frozen: {} };
  // Upit po svakom praćenom stablecoinu (filtar po mintu radi i za Token i za Token-2022 račune).
  const results = await Promise.all(Object.keys(WALLET_STABLES).map((mint) =>
    heliusPost(env, { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [addr, { mint }, { encoding: "jsonParsed" }] })));
  for (const r of results) {
    for (const a of (r && r.value) || []) {
      const info = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info;
      if (!info || !WALLET_STABLES[info.mint]) continue;
      const sym = WALLET_STABLES[info.mint];
      out.frozen[info.mint] = { sym, frozen: info.state === "frozen" || (out.frozen[info.mint] && out.frozen[info.mint].frozen) || false };
      if (info.delegate && info.delegatedAmount && Number(info.delegatedAmount.uiAmount) > 0) {
        out.approvals.push({ token: info.mint, sym, spender: info.delegate, unlimited: false, amount: Number(info.delegatedAmount.uiAmount), account: a.pubkey });
      }
    }
  }
  return out;
}

// ---- Općenito (Atlas): svježi podaci s DefiLlame za gumb Osvježi ----
// Velike JSON datoteke ne parsiramo cijele (CPU limit Workera): tražimo samo objekte koji nam trebaju.
const ATLAS_CHAINS = { eth: "Ethereum", sol: "Solana", base: "Base", arb: "Arbitrum", hood: "Robinhood Chain" };
const ATLAS_COINS = ["USDT", "USDC", "USDS", "USDe", "DAI", "USD1", "USDG", "PYUSD", "RLUSD", "USYC", "EURC", "BUIDL"];
const ATLAS_PROTOCOLS = ["Aave", "Aave V3", "Aerodrome", "Arcus", "Compound", "Compound V3", "Curve", "Drift", "EigenCloud", "Ethena", "Fables", "Falcon",
  "Falcon Finance", "Fluid", "GMX", "Gauntlet", "Grove", "Grove Finance", "Huma", "Jito", "Jupiter", "Kamino", "Lido", "Lighter", "Maple", "Maple Finance",
  "Meteora", "Morpho", "Morpho Blue", "OnRe", "Orca", "Pendle", "Pump", "Raydium", "Sanctum", "Sky", "Spark", "Steakhouse Financial", "USD AI", "Uniswap"];
// Drugi nazivi pod kojima DefiLlama vodi isti protokol (ili njegovu "parent" skupinu).
const ATLAS_ALIAS = { Compound: ["compound-finance"], Curve: ["curve-finance", "curve-dex"], EigenCloud: ["eigenlayer", "eigencloud"], Falcon: ["falcon-finance"],
  Grove: ["grove-finance"], Maple: ["maple-finance", "maple"], "Maple Finance": ["maple"], Huma: ["huma-finance"], Pump: ["pump", "pump.fun"], Lido: ["lido"],
  "Morpho Blue": ["morpho-blue"], "Steakhouse Financial": ["steakhouse-financial", "steakhouse"] };
const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
const jsonStr = (t, key, from, to) => {
  const k = t.indexOf('"' + key + '":"', from);
  if (k < 0 || k > to) return null;
  const a = k + key.length + 4, b = t.indexOf('"', a);
  return t.slice(a, b);
};
const jsonObj = (t, key, from, to) => {
  const k = t.indexOf('"' + key + '":{', from);
  if (k < 0 || k > to) return null;
  let i = k + key.length + 3, depth = 0;
  for (let j = i; j < t.length; j++) {
    const c = t.charCodeAt(j);
    if (c === 123) depth++;
    else if (c === 125 && --depth === 0) { try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; } }
  }
  return null;
};

async function atlasProtocols() {
  const r = await fetch("https://api.llama.fi/protocols");
  if (!r.ok) throw new Error("DefiLlama protocols HTTP " + r.status);
  const t = await r.text();
  const byName = {}, bySlug = {};
  for (const n of ATLAS_PROTOCOLS) {
    byName[n.toLowerCase()] = n;
    for (const sl of [slugify(n), ...(ATLAS_ALIAS[n] || [])]) (bySlug[sl] = bySlug[sl] || []).push(n);
  }
  const exact = {}, parent = {}, slugHit = {};
  const chains = Object.values(ATLAS_CHAINS);
  const pick = (ct) => { const o = {}; for (const c of chains) if (typeof ct[c] === "number") o[c] = ct[c]; return o; };
  let pos = t.indexOf('{"id":"');
  while (pos >= 0) {
    const next = t.indexOf('{"id":"', pos + 7), end = next < 0 ? t.length : next;
    const name = jsonStr(t, "name", pos, end) || "";
    const slug = jsonStr(t, "slug", pos, end) || "";
    const par = (jsonStr(t, "parentProtocol", pos, end) || "").replace(/^parent#/, "");
    const hitName = byName[name.toLowerCase()], hitSlug = !hitName && bySlug[slug] ? bySlug[slug] : null;
    const hitPar = par && bySlug[par];
    if (hitName || hitSlug || hitPar) {
      const ct = jsonObj(t, "chainTvls", pos, end);
      if (ct) {
        if (hitName) exact[hitName] = pick(ct);
        if (hitSlug) for (const n of hitSlug) slugHit[n] = slugHit[n] || pick(ct);
        if (hitPar) for (const n of hitPar) {
          const acc = parent[n] = parent[n] || {};
          for (const [c, v] of Object.entries(pick(ct))) acc[c] = (acc[c] || 0) + v;
        }
      }
    }
    pos = next;
  }
  const out = {};
  for (const n of ATLAS_PROTOCOLS) if (exact[n] || parent[n] || slugHit[n]) out[n] = exact[n] || parent[n] || slugHit[n];
  return out;
}

async function atlasStablecoins() {
  const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true");
  if (!r.ok) throw new Error("DefiLlama stablecoins HTTP " + r.status);
  const t = await r.text();
  const coins = {};
  for (const sym of ATLAS_COINS) {
    let k = t.indexOf('"symbol":"' + sym + '"');
    while (k >= 0) {
      const start = t.lastIndexOf('{"id":"', k), next = t.indexOf('{"id":"', k), end = next < 0 ? t.length : next;
      const peg = jsonStr(t, "pegType", start, end) || "peggedUSD";
      const circ = jsonObj(t, "circulating", start, end) || {};
      const total = Number(circ[peg]) || 0;
      if (!coins[sym] || total > coins[sym].total) {
        const cc = jsonObj(t, "chainCirculating", start, end) || {};
        const chains = {};
        for (const c of Object.values(ATLAS_CHAINS)) { const v = cc[c] && cc[c].current && Number(cc[c].current[peg]); if (v) chains[c] = v; }
        const pm = t.slice(start, end).match(/"price":(-?[\d.eE+-]+)/);
        coins[sym] = { total, peg, chains, price: pm ? Number(pm[1]) : null };
      }
      k = t.indexOf('"symbol":"' + sym + '"', end);
    }
  }
  return coins;
}

async function apiAtlas(ctx) {
  const [chainsR, tvlR, coins, prot] = await Promise.all([
    fetch("https://stablecoins.llama.fi/stablecoinchains").then((r) => { if (!r.ok) throw new Error("DefiLlama stablecoinchains HTTP " + r.status); return r.json(); }),
    fetch("https://api.llama.fi/v2/chains").then((r) => r.ok ? r.json() : []).catch(() => []),
    atlasStablecoins(),
    atlasProtocols().catch(() => ({})),
  ]);
  let market = 0;
  const supply = {};
  for (const c of chainsR) {
    const v = Object.values(c.totalCirculatingUSD || {}).reduce((a, x) => a + (Number(x) || 0), 0);
    market += v;
    for (const [k, n] of Object.entries(ATLAS_CHAINS)) if (c.name === n) supply[k] = v;
  }
  const tvl = {};
  for (const c of tvlR || []) for (const [k, n] of Object.entries(ATLAS_CHAINS)) if (c.name === n) tvl[k] = c.tvl;
  return { updated: new Date().toISOString(), market, supply, tvl, coins, protocols: prot };
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const API = {
  "/api/radar/evm": async (env, url) => {
    // ?chain=eth: samo jedna mreža. Stranica pita svaku mrežu posebnim zahtjevom, jer Cloudflare
    // dopušta najviše 50 vanjskih poziva po zahtjevu, a sve mreže zajedno znaju prijeći tu granicu.
    const only = RADAR_CHAINS.some((c) => c.key === url.searchParams.get("chain")) ? url.searchParams.get("chain") : "";
    const d = await memo("radar-evm:" + only, 120000, () => apiRadarEvm(env, only));
    if (!url.searchParams.has("summary")) return d;
    // Kratki pregled stanja po mrežama (za provjeru bez cijelog popisa mintanja).
    const chains = {};
    for (const [k, v] of Object.entries(d.chains)) chains[k] = { ok: v.ok, err: v.err, block: v.block, mints: v.mints ? v.mints.length : 0, max: v.mints ? Math.max(0, ...v.mints.map((m) => m.amt)) : 0 };
    return { updated: d.updated, chains };
  },
  "/api/radar/sol": (env) => memo("radar-sol", 180000, () => apiRadarSol(env)),
  // ?fresh=1 (gumb Osvježi): zaobilazi 10-minutnu memoriju, ali najviše jednom u minuti, da DefiLlama ne dobije previše upita.
  "/api/yields": (env, url, ctx) => url.searchParams.has("fresh")
    ? memo("yields-fresh", 60000, () => getYields({ min_tvl: 100000, limit: 2000, fresh: true }, ctx).then((d) => { MEMO.set("yields", { at: Date.now(), p: Promise.resolve(d) }); return d; }))
    : memo("yields", 600000, () => getYields({ min_tvl: 100000, limit: 2000 }, ctx)),
  "/api/evm/transfers": (env, url) => memo("tx:" + url.search, 120000, () => apiEvmTransfers(env, url)),
  "/api/evm/safety": (env, url) => memo("safe:" + url.search, 120000, () => apiEvmSafety(env, url)),
  "/api/sol/safety": (env, url) => memo("ssafe:" + url.search, 120000, () => apiSolSafety(env, url)),
  "/api/atlas": (env, url, ctx) => url.searchParams.has("fresh")
    ? memo("atlas-fresh", 60000, () => apiAtlas(ctx).then((d) => { MEMO.set("atlas", { at: Date.now(), p: Promise.resolve(d) }); return d; }))
    : memo("atlas", 600000, () => apiAtlas(ctx)),
  "/api/sol/wallet": (env, url) => memo("sw:" + url.search, 120000, () => getWallet(env, { address: url.searchParams.get("address"), pages: 3 })),
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Glavna adresa je s www; adresa bez www trajno preusmjerava na nju.
    if (url.hostname === "stablecoins-overview.mojaradnadomena.com") {
      url.hostname = "www.stablecoins-overview.mojaradnadomena.com";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (API[path]) {
      try {
        const data = await API[path](env, url, ctx);
        return Response.json(data, { headers: { "cache-control": "no-store", ...SECURITY_HEADERS } });
      } catch (e) {
        return Response.json({ error: String((e && e.message) || e).slice(0, 300) }, { status: (e && e.status) || 502, headers: SECURITY_HEADERS });
      }
    }
    const page = PAGES[path];
    if (page) return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", ...SECURITY_HEADERS } });
    return new Response(PAGES["/404"] || "Not found", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
