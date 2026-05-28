/* eslint-disable */
/* BUILD: 2026-05-25-v2 */
import { useState, useRef, useEffect } from "react";

// ── Storage polyfill (works in both artifact and browser) ─────
const storage = {
  get: async (key) => {
    try {
      const val = localStorage.getItem(key);
      return val ? { key, value: val } : null;
    } catch { return null; }
  },
  set: async (key, value) => {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch { return null; }
  },
  delete: async (key) => {
    try {
      localStorage.removeItem(key);
      return { key, deleted: true };
    } catch { return null; }
  },
};

// ── Firebase REST API ────────────────────────────────────────
const FB_API_KEY   = "AIzaSyDwKmdMKYRAiVL7AhenmS4tbx4uYy388Mg";
const FB_PROJECT   = "kotonoha-64f0b";
const FB_AUTH_URL  = "https://identitytoolkit.googleapis.com/v1/accounts";
const FB_STORE_URL = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY || "";

// Token storage
let _fbUser = null; // { uid, email, idToken, refreshToken }
let _authListeners = [];

function _notifyAuth(user) {
  _fbUser = user;
  _authListeners.forEach(fn => fn(user));
}

// Persist session in localStorage equivalent (sessionStorage)
function _saveSession(user) {
  try { localStorage.setItem("fb_user", JSON.stringify(user)); } catch {}
}
function _loadSession() {
  try { const s = localStorage.getItem("fb_user"); return s ? JSON.parse(s) : null; } catch { return null; }
}
function _clearSession() {
  try { localStorage.removeItem("fb_user"); } catch {}
}

// Restore session on load
setTimeout(() => {
  const saved = _loadSession();
  if (saved) _notifyAuth(saved);
  else _notifyAuth(null);
}, 50);

async function fbSignUp(email, password) {
  const res = await fetch(`${FB_AUTH_URL}:signUp?key=${FB_API_KEY}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ email, password, returnSecureToken:true }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || "UNKNOWN_ERROR";
    const e = new Error(msg);
    e.code = msg;
    throw e;
  }
  const user = { uid:data.localId, email:data.email, idToken:data.idToken, refreshToken:data.refreshToken };
  _saveSession(user); _notifyAuth(user);
}

async function fbSignIn(email, password) {
  const res = await fetch(`${FB_AUTH_URL}:signInWithPassword?key=${FB_API_KEY}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ email, password, returnSecureToken:true }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || "UNKNOWN_ERROR";
    const e = new Error(msg);
    e.code = msg;
    throw e;
  }
  const user = { uid:data.localId, email:data.email, idToken:data.idToken, refreshToken:data.refreshToken };
  _saveSession(user); _notifyAuth(user);
}

async function fbSignOut() {
  _clearSession(); _notifyAuth(null);
}

function fbGuestLogin() {
  const guest = { uid:"guest", email:"ゲスト", isGuest:true };
  _notifyAuth(guest);
}

async function onAuthChange(callback) {
  _authListeners.push(callback);
  return () => { _authListeners = _authListeners.filter(fn => fn !== callback); };
}

function _fsPath(uid, doc) {
  return `${FB_STORE_URL}/users/${uid}/data/${doc}`;
}

async function fbSaveDiaries(uid, data) {
  if (!_fbUser?.idToken) return;
  await fetch(_fsPath(uid, "diaries"), {
    method:"PATCH",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${_fbUser.idToken}` },
    body: JSON.stringify({ fields: { diaries:{ stringValue: JSON.stringify(data) }, updatedAt:{ integerValue: Date.now() } } }),
  });
}

async function fbLoadDiaries(uid) {
  if (!_fbUser?.idToken) return {};
  const res = await fetch(_fsPath(uid, "diaries"), {
    headers:{ "Authorization":`Bearer ${_fbUser.idToken}` },
  });
  if (!res.ok) return {};
  const data = await res.json();
  if (!data.fields?.diaries?.stringValue) return {};
  return JSON.parse(data.fields.diaries.stringValue);
}

// ── Constants ──────────────────────────────────────────────────
const TONES = {
  empathy: {
    label:"共感", icon:"🌸", color:"#e8a4b8", accent:"#c4687e", desc:"優しく寄り添う",
    system:(label)=>`あなたは温かく共感的な日記パートナーです。${label}の1日全体を一緒に振り返ることが目標です。一つの話題に深入りしすぎず、朝・昼・夜の流れ全体を自然に引き出してください。「他にはどんなことがありましたか？」「その後はどうでしたか？」など1日の広がりを促す質問をしてください。感情を丁寧に受け止め、共感の言葉を大切にしてください。返答は長すぎず、自然な会話のテンポを保ってください。日本語で返答してください。`,
  },
  analysis: {
    label:"分析", icon:"🔍", color:"#7eb8d4", accent:"#2a7fa8", desc:"冷静に整理する",
    system:(label)=>`あなたは冷静で論理的な日記アナリストです。${label}の1日全体を客観的に振り返ることが目標です。1日の出来事・感情・行動パターンを広く引き出してください（朝から夜まで）。「午前中はどうでしたか？」「仕事や勉強面では？」「人との関わりはありましたか？」など多角的に質問してください。一つの出来事だけに集中せず、1日全体の流れを構造化して「今日の全体的な流れを見ると〜」のように俯瞰した視点でまとめてください。日本語で返答してください。`,
  },
  friend: {
    label:"友達", icon:"✨", color:"#b8d4a4", accent:"#4a8c3f", desc:"フランクに話す",
    system:(label)=>`あなたはフランクで親しみやすい友人です。${label}の1日をざっくばらんに一緒に振り返ることが目標です。ため口で「それでそれで？」「他には？」「朝は何してたの？」など1日全体を聞き出してください。一つの話題で終わらせず「えー、それだけ？もっと教えてよ」と1日の色々を引き出してください。楽しかったこと・しんどかったこと全部聞いて、「今日めっちゃ濃い1日じゃん」など1日全体を受け止める言葉を使ってください。日本語で返答してください。`,
  },
};

const SUMMARY_SYSTEM = "あなたは日記の要約アシスタントです。ユーザーとAIの会話から、その日の出来事・感情・気づきを日本語で簡潔にまとめてください。\n\n【その日のできごと】\n〜\n\n【気持ち・感情】\n〜\n\n【気づき・まとめ】\n〜\n\n会話がない場合は「まだ十分な会話がありません」と返してください。";

const SCORE_SYSTEM = "以下の日記の会話から、その日の気分スコアを1〜10の整数で判定してください。1=とても辛い、5=普通、10=とても良い。必ず {\"score\": 数値, \"label\": \"一言ラベル\"} のJSONのみ返してください。他の文字は一切不要です。";

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const TODAY = fmt(new Date());

function dayLabel(ds) {
  if (ds===TODAY) return "今日";
  const diff = Math.round((new Date(TODAY+"T00:00:00")-new Date(ds+"T00:00:00"))/86400000);
  if (diff===1) return "昨日";
  const d = new Date(ds+"T00:00:00");
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

async function callAPI(system, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true",
      "x-api-key": ANTHROPIC_API_KEY,
    },
    body:JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:1000, system, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  return data.content?.map(b=>b.text||"").join("")||"";
}

async function loadData() {
  try {
    const [r4, r3] = await Promise.allSettled([
      storage.get("kotonoha-v4"),
      storage.get("kotonoha-v3"),
    ]);
    const d4 = r4.status==="fulfilled" && r4.value ? JSON.parse(r4.value.value) : {};
    const d3 = r3.status==="fulfilled" && r3.value ? JSON.parse(r3.value.value) : {};
    // Merge v3 into v4 (v4 takes priority for same dates)
    return { ...d3, ...d4 };
  } catch { return {}; }
}
async function saveData(data) {
  try { await storage.set("kotonoha-v4", JSON.stringify(data)); } catch {}
}

// ── Calendar ──────────────────────────────────────────────────
// ── Open Book modal ───────────────────────────────────────────
function BookModal({ ds, diaries, onClose, onChat, t }) {
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);

  const d = new Date(ds + "T00:00:00");
  const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const dow = ["日","月","火","水","木","金","土"][d.getDay()];
  const msgs = diaries[ds]?.messages?.filter(m => !m.toneChange) || [];
  const userMsgs = msgs.filter(m => m.role === "user");
  const score = diaries[ds]?.score;
  const scoreColor = score!=null?(score>=8?"#4a8c3f":score>=6?"#2a7fa8":score===5?"#7a9aaa":score>=3?"#d4856a":"#c4687e"):t.color;

  // Parse summary into sections
  const sections = (() => {
    if (!summary) return [];
    const defs = [
      { key:"できごと", icon:"📅", label:"その日のできごと", color:"#2a7fa8" },
      { key:"気持ち",   icon:"💭", label:"気持ち・感情",     color:"#c4687e" },
      { key:"まとめ",   icon:"✨", label:"気づき・まとめ",   color:"#4a8c3f" },
    ];
    const parts = summary.split("【").filter(Boolean);
    return defs.map(({ key, icon, label, color }) => {
      const part = parts.find(p => p.includes(key));
      if (!part) return null;
      const content = part.split("】").slice(1).join("】").trim();
      return content ? { icon, label, color, content } : null;
    }).filter(Boolean);
  })();

  useEffect(() => {
    if (userMsgs.length === 0) { setSummaryLoading(false); return; }
    const conv = msgs.map(m=>(m.role==="user"?"ユーザー":"AI")+": "+m.content).join("\n");
        fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true", "x-api-key": ANTHROPIC_API_KEY },
      body:JSON.stringify({
        model:"claude-sonnet-4-5", max_tokens:1000,
        system: SUMMARY_SYSTEM,
        messages:[{ role:"user", content:"以下は"+dateStr+"の会話です：\n\n"+conv }],
      }),
    })
    .then(r=>r.json())
    .then(data=>{ setSummary(data.content?.map(b=>b.text||"").join("")||""); })
    .catch(()=>{ setSummary("要約の取得に失敗しました。"); })
    .finally(()=>{ setSummaryLoading(false); });
  }, [ds]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 500);
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100,
      background:"rgba(40,30,20,0.55)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"32px 20px",
      opacity: closing ? 0 : 1,
      transition:"opacity 0.45s cubic-bezier(0.4,0,0.2,1)",
    }} onClick={handleClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%", maxWidth:480,
        animation: closing
          ? "bookClose 0.45s cubic-bezier(0.4,0,0.2,1) forwards"
          : "bookOpen 0.55s cubic-bezier(0.34,1.2,0.64,1) forwards",
        transformOrigin:"center center",
      }}>
        <div style={{
          background:"#faf6f0",
          borderRadius:"6px 14px 14px 6px",
          boxShadow:`-6px 0 0 ${scoreColor}, 0 20px 60px rgba(0,0,0,0.3)`,
          overflow:"hidden", display:"flex", flexDirection:"column",
        }}>
          {/* Header */}
          <div style={{
            background:`linear-gradient(135deg, ${scoreColor}cc, ${scoreColor}88)`,
            padding:"20px 22px 16px",
            display:"flex", alignItems:"flex-start", justifyContent:"space-between",
          }}>
            <div>
              <div style={{ fontSize:10, color:"#fff", opacity:0.7, letterSpacing:"0.12em", marginBottom:4 }}>DIARY</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{dateStr}</div>
              <div style={{ fontSize:12, color:"#fff", opacity:0.75, marginTop:2 }}>{dow}曜日</div>
            </div>
            {score!=null && (
              <div style={{ background:"rgba(255,255,255,0.22)", borderRadius:10, padding:"6px 12px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{score}/10</div>
                <div style={{ fontSize:9, color:"#fff", opacity:0.8 }}>気分</div>
              </div>
            )}
          </div>

          <div style={{ height:1, background:"#e8e0d4" }}/>

          {/* Summary content */}
          <div style={{ padding:"16px 22px 12px", overflowY:"auto", maxHeight:300, minHeight:80 }}>
            {summaryLoading ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"24px 0" }}>
                <div style={{ display:"flex", gap:6 }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:scoreColor, animation:`bounce 1.2s ${i*0.18}s infinite ease-in-out` }}/>
                  ))}
                </div>
                <span style={{ color:"#aaa", fontSize:12 }}>会話を分析中…</span>
              </div>
            ) : userMsgs.length === 0 ? (
              <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"24px 0", fontStyle:"italic" }}>
                まだ何も書かれていません
              </div>
            ) : sections.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {sections.map((sec,i)=>(
                  <div key={i} style={{
                    background:"#fff", border:`1px solid ${sec.color}20`,
                    borderRadius:12, padding:"12px 14px",
                    borderLeft:`4px solid ${sec.color}`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                      <span style={{ fontSize:14 }}>{sec.icon}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:sec.color }}>{sec.label}</span>
                    </div>
                    <div style={{ fontSize:12.5, lineHeight:1.8, color:"#3a2a1a", whiteSpace:"pre-wrap" }}>{sec.content}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize:13, lineHeight:1.8, color:"#3a2a1a", whiteSpace:"pre-wrap" }}>{summary}</div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:"10px 18px 16px", borderTop:"1px solid #e8ddd0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontSize:10, color:"#bbb", fontStyle:"italic" }}>― {userMsgs.length}件の記録 ―</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleClose} style={{
                background:"transparent", border:"1px solid #d0c8bc",
                borderRadius:8, padding:"6px 12px", cursor:"pointer",
                color:"#8a7a6a", fontSize:12, fontFamily:"inherit",
              }}>閉じる</button>
              <button onClick={()=>{ handleClose(); setTimeout(()=>onChat(ds), 500); }} style={{
                background:scoreColor, border:"none",
                borderRadius:8, padding:"6px 14px", cursor:"pointer",
                color:"#fff", fontSize:12, fontFamily:"inherit", fontWeight:600,
              }}>✏️ 続きを書く</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarPage({ diaries, onSelectDate, setDiaries, t }) {
  const now = new Date();
  const [vy, setVy] = useState(now.getFullYear());
  const [vm, setVm] = useState(now.getMonth());
  const [openBook, setOpenBook] = useState(null);
  const [showDevScore, setShowDevScore] = useState(false);
  const [devScoreInput, setDevScoreInput] = useState(5);
  const [selectedDates, setSelectedDates] = useState([]);
  const devLongPress = useRef(null);
  const startDevLP = () => { devLongPress.current = setTimeout(()=>setShowDevScore(v=>!v), 800); };
  const endDevLP   = () => clearTimeout(devLongPress.current);

  const daysInMonth = new Date(vy, vm+1, 0).getDate();
  const firstDow    = new Date(vy, vm, 1).getDay();
  const isCurMonth  = vy===now.getFullYear() && vm===now.getMonth();
  const prev = () => vm===0?(setVm(11),setVy(y=>y-1)):setVm(m=>m-1);
  const next = () => vm===11?(setVm(0),setVy(y=>y+1)):setVm(m=>m+1);

  const monthEntries = Object.keys(diaries).filter(ds=>{
    const d=new Date(ds+"T00:00:00");
    return d.getFullYear()===vy&&d.getMonth()===vm&&diaries[ds]?.messages?.some(m=>m.role==="user");
  }).length;

  const cells = [...Array(firstDow).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];

  return (
    <div style={{ padding:"20px 16px", overflowY:"auto", flex:1 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div
          style={{ fontSize:18, fontWeight:800, color:"#1a2a32", userSelect:"none", cursor:"default" }}
          onMouseDown={startDevLP} onMouseUp={endDevLP} onMouseLeave={endDevLP}
          onTouchStart={startDevLP} onTouchEnd={endDevLP}
        >カレンダー</div>
        {selectedDates.length > 0 && (
          <div style={{ fontSize:11, color:t.accent, fontWeight:600 }}>
            {selectedDates.length}日選択中
          </div>
        )}
      </div>

      {/* Dev: hidden bulk score setter */}
      <div style={{
        overflow:"hidden",
        maxHeight:showDevScore?"320px":"0px",
        opacity:showDevScore?1:0,
        transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)",
        marginBottom:showDevScore?16:0,
      }}>
        <div style={{ background:"#1a2a32", borderRadius:14, padding:"16px" }}>
          <div style={{ fontSize:11, color:"#c4687e", fontWeight:700, letterSpacing:"0.1em", marginBottom:8 }}>
            🛠 DEVELOPER MODE
          </div>
          <div style={{ fontSize:11, color:"#7a9aaa", marginBottom:12 }}>
            {selectedDates.length>0
              ? `選択した${selectedDates.length}日にスコアを適用`
              : "カレンダーの日付を複数タップして選択→スコアを適用"}
          </div>
          {/* Score picker */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(s=>{
              const col = s>=8?"#4a8c3f":s>=6?"#2a7fa8":s===5?"#7a7a8a":s>=3?"#d4856a":"#c4687e";
              return (
                <button key={s} onClick={()=>setDevScoreInput(s)} style={{
                  width:32, height:32, borderRadius:8, border:"none",
                  background:devScoreInput===s?col:"#ffffff15",
                  color:devScoreInput===s?"#fff":"#888",
                  cursor:"pointer", fontSize:12, fontWeight:devScoreInput===s?700:400,
                  fontFamily:"inherit", transition:"all 0.2s",
                }}>{s}</button>
              );
            })}
          </div>
          {/* Apply buttons */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button onClick={()=>{
              if(selectedDates.length===0) return;
              const scoreLabel = devScoreInput>=8?"とても良い":devScoreInput>=6?"良い":devScoreInput===5?"普通":devScoreInput>=3?"少し辛い":"辛い";
              setDiaries && setDiaries(prev=>{
                const updated={...prev};
                selectedDates.forEach(ds=>{
                  const lbl = devScoreInput>=8?"とても良い":devScoreInput>=6?"良い":devScoreInput===5?"普通":devScoreInput>=3?"少し辛い":"辛い";
                  // Create entry even if no diary exists
                  updated[ds]={ ...(updated[ds]||{ messages:[], tone:"empathy" }), score:devScoreInput, scoreLabel:lbl };
                });
                return updated;
              });
              setSelectedDates([]);
            }} style={{
              flex:2, padding:"8px", borderRadius:10,
              background:selectedDates.length>0?"#c4687e":"#ffffff10",
              border:"none", color:selectedDates.length>0?"#fff":"#555",
              cursor:selectedDates.length>0?"pointer":"default",
              fontSize:12, fontFamily:"inherit", fontWeight:600,
            }}>
              {selectedDates.length>0?`${selectedDates.length}日に適用`:"日付を選択してください"}
            </button>
            <button onClick={()=>setSelectedDates([])} style={{
              flex:1, padding:"8px", borderRadius:10,
              background:"#ffffff10", border:"none", color:"#888",
              cursor:"pointer", fontSize:11, fontFamily:"inherit",
            }}>選択解除</button>
          </div>
          <button onClick={()=>{setShowDevScore(false);setSelectedDates([]);}} style={{
            background:"transparent", border:"none", color:"#444",
            cursor:"pointer", fontFamily:"inherit", fontSize:10, width:"100%",
          }}>✕ 閉じる</button>
        </div>
      </div>

      <div style={{ background:"#ffffff80", borderRadius:16, border:"1px solid #00000010", padding:"12px 16px", marginBottom:20 }}>
        {/* Month nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <button onClick={prev} style={{ background:"transparent", border:"1px solid #00000015", borderRadius:8, color:"#5a7a8a", width:30, height:30, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#1a2a32" }}>{vy}年 {vm+1}月</div>
            {monthEntries>0 && <div style={{ fontSize:10, color:t.color, marginTop:2 }}>{monthEntries}件の記録</div>}
          </div>
          <button onClick={next} style={{ background:"transparent", border:"1px solid #00000015", borderRadius:8, color:"#5a7a8a", width:30, height:30, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, padding:"8px 0 4px" }}>
          {["日","月","火","水","木","金","土"].map((d,i)=>(
            <div key={d} style={{ textAlign:"center", fontSize:10, color:i===0?"#c4687e80":i===6?"#2a7fa880":"#7a9aaa" }}>{d}</div>
          ))}
        </div>

        {/* Date grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {cells.map((d,i)=>{
            if (!d) return <div key={`e${i}`}/>;
            const ds = `${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const isFuture = ds > TODAY;
            const isToday  = isCurMonth && d===now.getDate();
            const isSel    = openBook===ds;
            const hasEntry = diaries[ds]?.messages?.some(m=>m.role==="user");
            const score    = diaries[ds]?.score;
            const scoreColor = score!=null?(score>=8?"#4a8c3f":score>=6?"#2a7fa8":score<=2?"#c4687e":score<5?"#d4856a":"#7a9aaa"):null;

            return (
              <button key={ds} disabled={isFuture} onClick={()=>{
                if(isFuture) return;
                if(showDevScore){
                  setSelectedDates(prev=>prev.includes(ds)?prev.filter(d=>d!==ds):[...prev,ds]);
                } else {
                  setOpenBook(ds);
                }
              }} style={{
                aspectRatio:"1",
                borderRadius:8,
                border: selectedDates.includes(ds)?`2px solid #c4687e`:isSel?`2px solid ${t.accent}`:isToday?`1.5px solid ${t.accent}55`:"2px solid transparent",
                background: selectedDates.includes(ds)?"#c4687e22":isSel?t.accent:isToday?`${t.accent}18`:hasEntry?"#ffffff70":"transparent",
                color: isFuture?"#ccc":isSel?"#fff":isToday?t.accent:(new Date(ds+"T00:00:00").getDay()===0)?"#c4687e99":(new Date(ds+"T00:00:00").getDay()===6)?"#2a7fa899":"#2a4a5a",
                cursor: isFuture?"default":"pointer",
                fontSize:12, fontWeight:isToday||isSel?700:400,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                gap:2, transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
                fontFamily:"inherit",
              }}>
                <span>{d}</span>
                {hasEntry && (
                  <div style={{ width:4, height:4, borderRadius:"50%",
                    background:isSel?"rgba(255,255,255,0.8)":scoreColor||t.color }}/>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display:"flex", gap:14, padding:"10px 4px 2px", borderTop:"1px solid #00000008", marginTop:8 }}>
          {[{dot:true,color:t.color,label:"記録あり"},{box:true,bg:`${t.accent}18`,bd:`${t.accent}55`,label:"今日"},{box:true,bg:t.accent,label:"選択中"}].map((item,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:5 }}>
              {item.dot&&<div style={{ width:5,height:5,borderRadius:"50%",background:item.color }}/>}
              {item.box&&<div style={{ width:12,height:12,borderRadius:3,background:item.bg,border:item.bd?`1px solid ${item.bd}`:"none" }}/>}
              <span style={{ fontSize:10,color:"#7a9aaa" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent entries */}
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:"#7a9aaa", marginBottom:10 }}>最近の日記</div>
        {Object.keys(diaries).filter(ds=>diaries[ds]?.messages?.some(m=>m.role==="user")).sort((a,b)=>b.localeCompare(a)).slice(0,5).map(ds=>{
          const d = new Date(ds+"T00:00:00");
          const score = diaries[ds]?.score;
          const scoreColor = score!=null?(score>=8?"#4a8c3f":score>=6?"#2a7fa8":score<=2?"#c4687e":score<5?"#d4856a":"#7a9aaa"):null;
          const msgs = diaries[ds]?.messages?.filter(m=>!m.toneChange&&m.role==="user")||[];
          return (
            <div key={ds} onClick={()=>setOpenBook(ds)} style={{
              background:"#ffffff80", border:"1px solid #00000008", borderRadius:12,
              padding:"12px 14px", marginBottom:8, cursor:"pointer",
              display:"flex", alignItems:"center", gap:12,
              transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
              borderLeft:`4px solid ${scoreColor||t.color}`,
            }}
            onMouseEnter={e=>{ e.currentTarget.style.transform="translateX(4px)"; e.currentTarget.style.background="#ffffff"; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.background=""; }}
            >
              <div style={{ fontSize:20 }}>📖</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:"#1a2a32", fontWeight:600 }}>
                  {d.getMonth()+1}月{d.getDate()}日（{["日","月","火","水","木","金","土"][d.getDay()]}）
                </div>
                <div style={{ fontSize:11, color:"#7a9aaa", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {msgs[0]?.content?.slice(0,40)||"記録なし"}…
                </div>
              </div>
              {score!=null && (
                <div style={{ fontSize:13, fontWeight:700, color:scoreColor||"#7a9aaa" }}>
                  {score}/10
                </div>
              )}
            </div>
          );
        })}
        {Object.keys(diaries).filter(ds=>diaries[ds]?.messages?.some(m=>m.role==="user")).length===0 && (
          <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"24px 0" }}>まだ日記がありません</div>
        )}
      </div>

      {/* Book modal with fade in/out */}
      {openBook && (
        <BookModal
          ds={openBook}
          diaries={diaries}
          onClose={()=>setOpenBook(null)}
          onChat={onSelectDate}
          t={t}
        />
      )}
    </div>
  );
}


function DatePickerMini({ diaries, selected, onSelect, t }) {
  const now = new Date();
  const [vy, setVy] = useState(()=>{ const d=new Date(selected+"T00:00:00"); return d.getFullYear(); });
  const [vm, setVm] = useState(()=>{ const d=new Date(selected+"T00:00:00"); return d.getMonth(); });
  const daysInMonth = new Date(vy, vm+1, 0).getDate();
  const firstDow = new Date(vy, vm, 1).getDay();
  const isCurMonth = vy===now.getFullYear() && vm===now.getMonth();
  const prev = () => vm===0?(setVm(11),setVy(y=>y-1)):setVm(m=>m-1);
  const next = () => vm===11?(setVm(0),setVy(y=>y+1)):setVm(m=>m+1);
  const cells = [...Array(firstDow).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  return (
    <div style={{ padding:"0 12px 12px" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 8px 6px" }}>
        <button onClick={prev} style={{ background:"transparent",border:"1px solid #00000015",borderRadius:6,color:"#5a7a8a",width:24,height:24,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>‹</button>
        <span style={{ fontSize:13,fontWeight:600,color:"#2a4a5a" }}>{vy}年 {vm+1}月</span>
        <button onClick={next} style={{ background:"transparent",border:"1px solid #00000015",borderRadius:6,color:"#5a7a8a",width:24,height:24,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>›</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:4 }}>
        {["日","月","火","水","木","金","土"].map((d,i)=>(
          <div key={d} style={{ textAlign:"center",fontSize:9,color:i===0?"#e8a4b880":i===6?"#7eb8d480":"#aaa",paddingBottom:3 }}>{d}</div>
        ))}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3 }}>
        {cells.map((d,i)=>{
          if(!d) return <div key={`e${i}`}/>;
          const ds=`${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const isFuture=ds>TODAY;
          const isToday=isCurMonth&&d===now.getDate();
          const isSel=ds===selected;
          const hasEntry=diaries[ds]?.messages?.some(m=>m.role==="user");
          const dow=(firstDow+d-1)%7;
          return (
            <button key={ds} disabled={isFuture} onClick={()=>!isFuture&&onSelect(ds)} style={{
              aspectRatio:"1",borderRadius:6,padding:0,
              border:isSel?`2px solid ${t.accent}`:isToday?`1.5px solid ${t.accent}55`:"1.5px solid transparent",
              background:isSel?t.accent:isToday?`${t.accent}18`:hasEntry?"#c8e0ea":"transparent",
              color:isFuture?"#ddd":isSel?"#fff":dow===0?"#c4687e88":dow===6?"#2a7fa888":"#2a4a5a",
              cursor:isFuture?"default":"pointer",fontSize:11,fontWeight:isSel||isToday?700:400,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
            }}>
              <span>{d}</span>
              {hasEntry&&!isSel&&<div style={{ width:3,height:3,borderRadius:"50%",background:t.color }}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Profile Page ──────────────────────────────────────────────
// ── Auth Panel (embedded in ProfilePage) ─────────────────────
function AuthPanel({ t }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) { setError("メールアドレスとパスワードを入力してください"); return; }
    setError(""); setLoading(true);
    try {
      if (mode === "signup") {
        await fbSignUp(email, password);
      } else {
        await fbSignIn(email, password);
      }
      setDone(true);
    } catch(e) {
      const raw = e.message || e.code || "";
      const msg = raw.includes("EMAIL_EXISTS") ? "このメールはすでに使われています"
        : raw.includes("INVALID_LOGIN_CREDENTIALS") || raw.includes("INVALID_PASSWORD") || raw.includes("EMAIL_NOT_FOUND") ? "メールまたはパスワードが違います"
        : raw.includes("WEAK_PASSWORD") ? "パスワードは6文字以上にしてください"
        : raw.includes("INVALID_EMAIL") ? "メールアドレスの形式が正しくありません"
        : raw.includes("TOO_MANY_ATTEMPTS") ? "試行回数が多すぎます。しばらく待ってください"
        : "エラー: " + raw;
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ background:"#ffffff80",border:"1px solid #00000010",borderRadius:14,padding:"18px",marginBottom:16 }}>
      <div style={{ fontSize:12,color:"#7a9aaa",marginBottom:14 }}>アカウント</div>

      {/* Tab */}
      <div style={{ display:"flex",background:"#EAF1F4",borderRadius:10,padding:3,marginBottom:16,gap:3 }}>
        {[{key:"login",label:"ログイン"},{key:"signup",label:"新規登録"}].map(tab=>(
          <button key={tab.key} onClick={()=>{setMode(tab.key);setError("");}} style={{
            flex:1,padding:"7px",borderRadius:8,border:"none",
            background:mode===tab.key?"#fff":"transparent",
            color:mode===tab.key?"#1a2a32":"#7a9aaa",
            fontWeight:mode===tab.key?700:400,
            fontSize:12,cursor:"pointer",fontFamily:"inherit",
            boxShadow:mode===tab.key?"0 1px 6px rgba(0,0,0,0.08)":"none",
            transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Email */}
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
        placeholder="メールアドレス"
        style={{ width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #00000015",
          background:"#f8fafb",color:"#1a2a32",fontSize:13,fontFamily:"inherit",
          outline:"none",boxSizing:"border-box",marginBottom:8 }}
      />
      {/* Password */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
          placeholder={mode==="signup"?"パスワード（6文字以上）":"パスワード"}
          style={{ width:"100%",padding:"10px 40px 10px 12px",borderRadius:10,border:"1px solid #00000015",
            background:"#f8fafb",color:"#1a2a32",fontSize:13,fontFamily:"inherit",
            outline:"none",boxSizing:"border-box" }}
        />
        <button onClick={()=>setShowPw(v=>!v)} style={{
          position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
          background:"transparent",border:"none",cursor:"pointer",
          fontSize:16,color:"#7a9aaa",padding:4,lineHeight:1,
        }}>{showPw?"🙈":"👁️"}</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:"#fde8e8",border:"1px solid #f4a0a0",borderRadius:8,
          padding:"8px 12px",fontSize:11,color:"#c44",marginBottom:10 }}>
          {error}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleSubmit} disabled={loading} style={{
        width:"100%",padding:"11px",borderRadius:10,border:"none",
        background:loading?"#ccc":t.accent,color:"#fff",
        fontSize:13,fontWeight:700,cursor:loading?"default":"pointer",
        fontFamily:"inherit",transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {loading?"処理中...":mode==="login"?"ログイン":"アカウント作成"}
      </button>

      <div style={{ textAlign:"center",marginTop:10,fontSize:10,color:"#aaa" }}>
        ログインするとデータがクラウドに保存されます ☁️
      </div>
    </div>
  );
}

function ProfilePage({ diaries, t, user }) {
  const [profile, setProfile] = useState({ name:"", bio:"", avatar:"" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name:"", bio:"" });
  const [cropSrc, setCropSrc] = useState(null);
  const [cropPos, setCropPos] = useState({ x:0, y:0 });
  const [cropScale, setCropScale] = useState(1);
  const [cropDragging, setCropDragging] = useState(false);
  const [cropDragStart, setCropDragStart] = useState({ x:0, y:0 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ w:1, h:1 });
  const [pinchStartDist, setPinchStartDist] = useState(null);
  const [pinchStartScale, setPinchStartScale] = useState(1);
  const fileInputRef = useRef(null);

  useEffect(()=>{
    storage.get("kotonoha-profile").then(r=>{ if(r) setProfile(JSON.parse(r.value)); }).catch(()=>{});
  },[]);

  const saveProfile = async ()=>{
    const updated = { ...profile, ...draft };
    setProfile(updated);
    setEditing(false);
    await storage.set("kotonoha-profile", JSON.stringify(updated));
  };

  // Open file picker directly (bypass the button step)
  const openPicker = () => fileInputRef.current?.click();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset input so same file can be re-selected after cancel
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setImgNaturalSize({ w: img.width, h: img.height });
        // Portrait: fit by width. Landscape: fit by height.
        // Start at scale=1 so user can zoom in freely
        setCropScale(1);
        setCropPos({ x:0, y:0 });
        setCropSrc(ev.target.result);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const cancelCrop = () => {
    setCropSrc(null);
    // Re-open picker
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const applyCrop = () => {
    const canvas = document.createElement("canvas");
    const size = 300;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const areaSize = Math.min(window.innerWidth, 500);
      const displayScale = areaSize / imgNaturalSize.w;
      const scaledW = imgNaturalSize.w * displayScale * cropScale;
      const scaledH = imgNaturalSize.h * displayScale * cropScale;
      const halfArea = areaSize / 2;
      // Image top-left position in area coords
      const imgLeft = halfArea - scaledW/2 + cropPos.x;
      const imgTop  = halfArea - scaledH/2 + cropPos.y;
      // Circle: center=halfArea, radius=halfArea*0.79
      const r = halfArea * 0.79;
      const circleLeft = halfArea - r;
      const circleTop  = halfArea - r;
      // Source coords in original image
      const sx = (circleLeft - imgLeft) / (scaledW / imgNaturalSize.w);
      const sy = (circleTop  - imgTop)  / (scaledH / imgNaturalSize.h);
      const sSize = (r * 2) / (scaledW / imgNaturalSize.w);
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setProfile(p => ({ ...p, avatar: dataUrl, avatarType: "image" }));
      setCropSrc(null);
    };
    img.src = cropSrc;
  };

  const EMOJIS = ["🐱","🐶","🦊","🐼","🐨","🦁","🐸","🐙","🌸","⭐","🌙","🔥","💎","🌈","🍀","🎵"];

  const totalDays = Object.values(diaries).filter(d=>d?.messages?.some(m=>m.role==="user")).length;
  const scores = Object.values(diaries).filter(d=>d?.score!=null).map(d=>d.score);
  const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null;
  const streak = (()=>{
    let count=0; const ds=new Date();
    while(true){
      const key=fmt(ds);
      if(diaries[key]?.messages?.some(m=>m.role==="user")){ count++; ds.setDate(ds.getDate()-1); } else break;
    }
    return count;
  })();

  const areaSize = "min(100vw, 500px)";

  return (
    <div style={{ padding:"24px 18px",overflowY:"auto",flex:1 }}>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }}/>

      {/* Crop Modal */}
      {cropSrc && (
        <div style={{
          position:"fixed", inset:0, zIndex:200,
          background:"#000",
          display:"flex", flexDirection:"column",
          animation:"cropSlideUp 0.25s cubic-bezier(0.32,0.72,0,1) forwards",
          touchAction:"none",
          overscrollBehavior:"none",
          WebkitOverflowScrolling:"touch",
        }}
          onTouchMove={e=>e.stopPropagation()}
        >
          {/* Top bar */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"52px 20px 14px",
            background:"rgba(0,0,0,0.85)",
            backdropFilter:"blur(20px)",
            flexShrink:0,
          }}>
            <button onClick={cancelCrop} style={{
              background:"transparent", border:"none", color:"#fff",
              fontSize:15, cursor:"pointer", fontFamily:"inherit", padding:"4px 0",
            }}>キャンセル</button>
            <div style={{ fontSize:15, fontWeight:600, color:"#fff" }}>移動とスケール</div>
            <button onClick={applyCrop} style={{
              background:"transparent", border:"none",
              color:t.color, fontSize:15, fontWeight:700,
              cursor:"pointer", fontFamily:"inherit",
            }}>選択</button>
          </div>

          {/* Crop area - canvas-based approach for full drag freedom */}
          <div style={{
            width:"100%", maxWidth:500, alignSelf:"center",
            aspectRatio:"1/1", position:"relative",
            background:"#000", flexShrink:0, overflow:"hidden",
            touchAction:"none",
            overscrollBehavior:"none",
          }}>
            {/* Drag & pinch handler */}
            <div style={{
              position:"absolute",
              inset:"-300px",
              cursor:cropDragging?"grabbing":"grab",
              userSelect:"none",
              touchAction:"none",
              zIndex:5,
              WebkitUserSelect:"none",
            }}
              onMouseDown={e=>{ e.preventDefault(); setCropDragging(true); setCropDragStart({x:e.clientX-cropPos.x, y:e.clientY-cropPos.y}); }}
              onMouseMove={e=>{ e.preventDefault(); if(!cropDragging) return; setCropPos({x:e.clientX-cropDragStart.x, y:e.clientY-cropDragStart.y}); }}
              onMouseUp={e=>{ e.preventDefault(); setCropDragging(false); }}
              onMouseLeave={e=>{ setCropDragging(false); }}
              onWheel={e=>{ e.preventDefault(); const delta = e.deltaY > 0 ? -0.08 : 0.08; setCropScale(s=>Math.min(5, Math.max(1, s+delta))); }}
              onTouchStart={e=>{
                e.preventDefault();
                e.stopPropagation();
                if(e.touches.length===1){
                  const touch=e.touches[0];
                  setCropDragging(true);
                  setCropDragStart({x:touch.clientX-cropPos.x, y:touch.clientY-cropPos.y});
                } else if(e.touches.length===2){
                  setCropDragging(false);
                  const t0=e.touches[0], t1=e.touches[1];
                  const dx=t0.clientX-t1.clientX, dy=t0.clientY-t1.clientY;
                  const dist=Math.sqrt(dx*dx+dy*dy);
                  const midX=(t0.clientX+t1.clientX)/2;
                  const midY=(t0.clientY+t1.clientY)/2;
                  setPinchStartDist(dist);
                  setPinchStartScale(cropScale);
                  setCropDragStart({x:midX-cropPos.x, y:midY-cropPos.y});
                }
              }}
              onTouchMove={e=>{
                e.preventDefault();
                e.stopPropagation();
                if(e.touches.length===1 && cropDragging){
                  const touch=e.touches[0];
                  setCropPos({x:touch.clientX-cropDragStart.x, y:touch.clientY-cropDragStart.y});
                } else if(e.touches.length===2){
                  const t0=e.touches[0], t1=e.touches[1];
                  const dx=t0.clientX-t1.clientX, dy=t0.clientY-t1.clientY;
                  const dist=Math.sqrt(dx*dx+dy*dy);
                  // Zoom
                  if(pinchStartDist){
                    const newScale=Math.min(5, Math.max(1, pinchStartScale*(dist/pinchStartDist)));
                    setCropScale(newScale);
                  }
                  // Move by midpoint
                  const midX=(t0.clientX+t1.clientX)/2;
                  const midY=(t0.clientY+t1.clientY)/2;
                  setCropPos({x:midX-cropDragStart.x, y:midY-cropDragStart.y});
                }
              }}
              onTouchEnd={e=>{
                e.preventDefault();
                e.stopPropagation();
                if(e.touches.length===0){
                  setCropDragging(false);
                  setPinchStartDist(null);
                } else if(e.touches.length===1){
                  // Transition from 2-finger to 1-finger
                  setPinchStartDist(null);
                  setCropDragging(true);
                  const touch=e.touches[0];
                  setCropDragStart({x:touch.clientX-cropPos.x, y:touch.clientY-cropPos.y});
                }
              }}
            />
            {/* Image - free to move beyond container bounds */}
            <img src={cropSrc} alt="crop" draggable={false} style={{
              position:"absolute",
              left:"50%", top:"50%",
              transform:`translate(calc(-50% + ${cropPos.x}px), calc(-50% + ${cropPos.y}px)) scale(${cropScale})`,
              transformOrigin:"center center",
              width: imgNaturalSize.h > imgNaturalSize.w ? "auto" : "100%",
              height: imgNaturalSize.h > imgNaturalSize.w ? "100%" : "auto",
              maxWidth:"none", maxHeight:"none",
              pointerEvents:"none", userSelect:"none",
              zIndex:1,
            }}/>
            {/* Circle overlay SVG - on top of image, below drag handler */}
            <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:2 }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <mask id="hole">
                  <rect width="100" height="100" fill="white"/>
                  <circle cx="50" cy="50" r="39.5" fill="black"/>
                </mask>
              </defs>
              <rect width="100" height="100" fill="rgba(0,0,0,0.6)" mask="url(#hole)"/>
              <circle cx="50" cy="50" r="39.5" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="0.5"/>
              <line x1="36.7" y1="10.5" x2="36.7" y2="89.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4"/>
              <line x1="63.3" y1="10.5" x2="63.3" y2="89.5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4"/>
              <line x1="10.5" y1="36.7" x2="89.5" y2="36.7" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4"/>
              <line x1="10.5" y1="63.3" x2="89.5" y2="63.3" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4"/>
            </svg>
          </div>

          {/* Zoom slider */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 32px" }}>
            <input type="range" min="1" max="5" step="0.02"
              value={cropScale}
              onChange={e=>setCropScale(parseFloat(e.target.value))}
              style={{ width:"100%", maxWidth:400, accentColor:"#fff", cursor:"pointer" }}
            />
            <div style={{ display:"flex", justifyContent:"space-between", width:"100%", maxWidth:400, fontSize:11, color:"#555", marginTop:6 }}>
              <span>縮小</span>
              <span style={{ color:"#666" }}>{Math.round(cropScale*100)}%</span>
              <span>拡大</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize:18,fontWeight:800,color:"#1a2a32",marginBottom:20 }}>プロフィール</div>

      {/* Avatar & name */}
      <div style={{ background:"#ffffff80",border:"1px solid #00000010",borderRadius:20,padding:"28px 20px",textAlign:"center",marginBottom:16 }}>
        <div style={{ marginBottom:12 }}>
          {profile.avatarType==="image" && profile.avatar ? (
            <img src={profile.avatar} alt="avatar" style={{ width:80,height:80,borderRadius:"50%",objectFit:"cover",border:`3px solid ${t.color}40` }}/>
          ) : (
            <div style={{ fontSize:64,lineHeight:1 }}>{profile.avatar||"🌙"}</div>
          )}
        </div>
        {editing?(
          <div>
            <button onClick={openPicker} style={{
              width:"100%",padding:"10px",borderRadius:12,marginBottom:12,
              background:`${t.color}14`,border:`1px dashed ${t.color}50`,
              color:t.accent,fontSize:13,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            }}>
              🖼️ 写真・画像から選ぶ
            </button>
            <div style={{ fontSize:11,color:"#7a9aaa",marginBottom:10,textAlign:"center" }}>または絵文字を選ぶ</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:16 }}>
              {EMOJIS.map(e=>(
                <button key={e} onClick={()=>setProfile(p=>({...p,avatar:e,avatarType:"emoji"}))} style={{
                  fontSize:24,background:profile.avatar===e?`${t.color}22`:"transparent",
                  border:profile.avatar===e?`2px solid ${t.accent}`:"2px solid transparent",
                  borderRadius:10,padding:6,cursor:"pointer",
                }}>{e}</button>
              ))}
            </div>
            <input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}
              placeholder="名前を入力…" maxLength={20}
              style={{ width:"100%",background:"#C8DCE6",border:`1px solid ${t.color}30`,borderRadius:10,padding:"10px 14px",color:"#1a2a32",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:10 }}
            />
            <textarea value={draft.bio} onChange={e=>setDraft(d=>({...d,bio:e.target.value}))}
              placeholder="自己紹介を入力…" maxLength={100} rows={3}
              style={{ width:"100%",background:"#C8DCE6",border:`1px solid ${t.color}30`,borderRadius:10,padding:"10px 14px",color:"#1a2a32",fontSize:13,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box",marginBottom:14 }}
            />
            <div style={{ display:"flex",gap:8,justifyContent:"center" }}>
              <button onClick={()=>setEditing(false)} style={{ padding:"8px 20px",borderRadius:10,border:"1px solid #ccc",background:"transparent",color:"#5a7a8a",cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>キャンセル</button>
              <button onClick={saveProfile} style={{ padding:"8px 20px",borderRadius:10,border:"none",background:t.accent,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600 }}>保存</button>
            </div>
          </div>
        ):(
          <div>
            <div style={{ fontSize:18,fontWeight:700,color:"#1a2a32",marginBottom:6 }}>{profile.name||"名前未設定"}</div>
            <div style={{ fontSize:13,color:"#7a9aaa",lineHeight:1.6,marginBottom:16,minHeight:20 }}>{profile.bio||"自己紹介を追加してみよう"}</div>
            <button onClick={()=>{ setDraft({name:profile.name,bio:profile.bio}); setEditing(true); }} style={{
              background:`${t.color}12`,border:`1px solid ${t.color}30`,borderRadius:10,
              padding:"8px 20px",cursor:"pointer",color:t.color,fontSize:12,fontFamily:"inherit",
            }}>✏️ 編集する</button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16 }}>
        {[
          { label:"記録日数", value:totalDays+"日" },
          { label:"連続記録", value:streak+"日" },
          { label:"平均気分", value:avg!=null?`${avg}/10`:"--" },
        ].map((s,i)=>(
          <div key={i} style={{ background:"#ffffff80",border:"1px solid #00000010",borderRadius:14,padding:"16px 10px",textAlign:"center" }}>
            <div style={{ fontSize:11,color:"#7a9aaa",marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:20,fontWeight:800,color:"#1a2a32" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Account section */}
      {user ? (
        <div style={{ background:"#ffffff80",border:"1px solid #00000010",borderRadius:14,padding:"16px 18px",marginBottom:16 }}>
          <div style={{ fontSize:12,color:"#7a9aaa",marginBottom:10 }}>アカウント</div>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14 }}>
            <div style={{ width:36,height:36,borderRadius:"50%",background:`${t.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>🍂</div>
            <div>
              <div style={{ fontSize:12,fontWeight:600,color:"#1a2a32" }}>{user.email}</div>
              <div style={{ fontSize:10,color:"#7a9aaa",marginTop:1 }}>クラウド同期中 ☁️</div>
            </div>
          </div>
          <button onClick={async()=>{ await fbSignOut(); }} style={{
            width:"100%",padding:"10px",borderRadius:10,border:"1px solid #c4687e44",
            background:"#c4687e10",color:"#c4687e",cursor:"pointer",
            fontSize:13,fontFamily:"inherit",fontWeight:600,
          }}>ログアウト</button>
        </div>
      ) : (
        <AuthPanel t={t}/>
      )}

      {/* About */}
      <div style={{ background:"#ffffff80",border:"1px solid #00000010",borderRadius:14,padding:"16px 18px" }}>
        <div style={{ fontSize:12,color:"#7a9aaa",marginBottom:12 }}>アプリについて</div>
        {[
          { label:"アプリ名", value:"言の葉" },
          { label:"バージョン", value:"1.0.0" },
          { label:"コンセプト", value:"気持ちを言葉に" },
        ].map((item,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<2?"1px solid #00000008":"none" }}>
            <span style={{ fontSize:13,color:"#7a9aaa" }}>{item.label}</span>
            <span style={{ fontSize:13,color:"#1a2a32" }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



const ITEMS = [
  { id:"bench",    name:"ベンチ",   unlockAt:3,  w:56, h:36 },
  { id:"tree",     name:"木",       unlockAt:5,  w:52, h:56 },
  { id:"lantern",  name:"提灯",     unlockAt:8,  w:32, h:48 },
  { id:"flower",   name:"花壇",     unlockAt:10, w:60, h:32 },
  { id:"fountain", name:"噴水",     unlockAt:15, w:60, h:64 },
  { id:"tent",     name:"小屋",     unlockAt:20, w:68, h:64 },
  { id:"shrine",   name:"鳥居",     unlockAt:25, w:52, h:72 },
  { id:"campfire", name:"焚き火",   unlockAt:30, w:44, h:46 },
  { id:"sakura",   name:"桜の木",   unlockAt:40, w:62, h:70 },
  { id:"well",     name:"井戸",     unlockAt:50, w:50, h:52 },
  { id:"moon",     name:"満月",     unlockAt:60, w:54, h:54 },
];

function ItemSvg({ id, w=56, h=56 }) {
  switch(id) {
    case "bench": return (
      <svg width={w} height={h} viewBox="0 0 56 36">
        <rect x="6" y="16" width="44" height="7" rx="2" fill="#c8922a" stroke="#a07020" strokeWidth="1"/>
        <rect x="8"  y="23" width="5" height="9" rx="1" fill="#a07020"/>
        <rect x="43" y="23" width="5" height="9" rx="1" fill="#a07020"/>
        <rect x="22" y="23" width="5" height="9" rx="1" fill="#a07020"/>
        <rect x="6"  y="10" width="44" height="6" rx="2" fill="#d4a840" stroke="#a07020" strokeWidth="0.8"/>
      </svg>
    );
    case "tree": return (
      <svg width={w} height={h} viewBox="0 0 52 56">
        <ellipse cx="26" cy="30" rx="20" ry="18" fill="#3a8a1a" opacity="0.85"/>
        <ellipse cx="26" cy="22" rx="15" ry="13" fill="#4a9a28"/>
        <ellipse cx="26" cy="15" rx="10"  ry="9"  fill="#5ab030"/>
        <rect x="22" y="38" width="8" height="14" rx="2" fill="#8b5a2a"/>
        <ellipse cx="26" cy="52" rx="10" ry="3" fill="#00000015"/>
      </svg>
    );
    case "lantern": return (
      <svg width={w} height={h} viewBox="0 0 32 48">
        <rect x="14" y="1" width="4" height="7" rx="1" fill="#888"/>
        <rect x="7"  y="8" width="18" height="22" rx="4" fill="#f4c840" stroke="#c89820" strokeWidth="1.5"/>
        <rect x="9"  y="10" width="14" height="18" rx="3" fill="#fde87a" opacity="0.8"/>
        <rect x="5"  y="7"  width="22" height="4"  rx="2" fill="#c84a1a"/>
        <rect x="5"  y="30" width="22" height="4"  rx="2" fill="#c84a1a"/>
        <rect x="13" y="34" width="6"  height="10" rx="1" fill="#888"/>
        <circle cx="16" cy="19" r="4" fill="#fff" opacity="0.35"/>
      </svg>
    );
    case "flower": return (
      <svg width={w} height={h} viewBox="0 0 60 32">
        <rect x="3"  y="14" width="54" height="14" rx="4" fill="#c8a870" stroke="#a08050" strokeWidth="1"/>
        {[10,22,34,46,57].map((x,i)=>(
          <g key={i}>
            <circle cx={x} cy="10" r="5" fill={["#e84a8a","#f4a020","#e84040","#a040c8","#40a8e8"][i]}/>
            <circle cx={x+2} cy="7" r="4" fill={["#f060a0","#f8b840","#f06060","#b860e0","#60c0f0"][i]}/>
            <rect x={x-1} y="11" width="2" height="5" fill="#4a8a1a"/>
          </g>
        ))}
      </svg>
    );
    case "fountain": return (
      <svg width={w} height={h} viewBox="0 0 60 64">
        <ellipse cx="30" cy="54" rx="24" ry="8"  fill="#5a9ab8" stroke="#4a8aa8" strokeWidth="1"/>
        <ellipse cx="30" cy="52" rx="22" ry="7"  fill="#7ab8d4" opacity="0.7"/>
        <rect    x="26"  y="28" width="8"  height="26" rx="3" fill="#c8c8c8" stroke="#a8a8a8" strokeWidth="1"/>
        <ellipse cx="30" cy="28" rx="11" ry="4"  fill="#a8c8d8"/>
        <path d="M30 26 C25 17 21 11 24 7 M30 26 C33 15 37 9 35 5 M30 26 C28 13 30 7 30 3" stroke="#7ab8e8" strokeWidth="1.5" fill="none" opacity="0.8"/>
        <ellipse cx="30" cy="58" rx="24" ry="6" fill="#00000012"/>
      </svg>
    );
    case "tent": return (
      <svg width={w} height={h} viewBox="0 0 68 64">
        <polygon points="34,4 64,52 4,52"  fill="#d4782a" stroke="#a85a1a" strokeWidth="1.5"/>
        <polygon points="34,4 52,52 16,52" fill="#e89040"/>
        <rect x="4"  y="52" width="60" height="7" rx="2" fill="#8b6a3a"/>
        <polygon points="34,18 46,52 22,52" fill="#c86020"/>
        <rect x="28" y="36" width="12" height="16" rx="2" fill="#2a1a0a"/>
      </svg>
    );
    case "shrine": return (
      <svg width={w} height={h} viewBox="0 0 52 72">
        <rect x="6"  y="12" width="9" height="56" rx="2" fill="#c84a1a"/>
        <rect x="37" y="12" width="9" height="56" rx="2" fill="#c84a1a"/>
        <rect x="4"  y="8"  width="44" height="6" rx="2" fill="#8b2a0a"/>
        <path d="M1 14 C13 7 39 7 51 14 L48 20 C39 14 13 14 4 20 Z" fill="#c84a1a"/>
        <rect x="3" y="20" width="46" height="4" rx="1" fill="#a83a10"/>
        <ellipse cx="26" cy="69" rx="20" ry="3" fill="#00000015"/>
      </svg>
    );
    case "campfire": return (
      <svg width={w} height={h} viewBox="0 0 44 46">
        <ellipse cx="22" cy="40" rx="16" ry="5" fill="#00000015"/>
        {[14,22,30].map((x,i)=>(
          <rect key={i} x={x-2} y="27" width="4" height="11" rx="1" fill="#8b5a2a" transform={`rotate(${(i-1)*15},${x},35)`}/>
        ))}
        <path d="M18 27 C16 18 19 11 22 7 C25 11 28 18 26 27" fill="#e8780a"/>
        <path d="M19 26 C17 19 20 13 22 9 C24 13 27 19 25 26" fill="#f4a820"/>
        <path d="M20 25 C19 20 21 15 22 12 C23 15 25 20 24 25" fill="#fde840" opacity="0.8"/>
      </svg>
    );
    case "sakura": return (
      <svg width={w} height={h} viewBox="0 0 62 70">
        <ellipse cx="31" cy="30" rx="24" ry="20" fill="#f4b8c8" opacity="0.85"/>
        <ellipse cx="31" cy="22" rx="18" ry="15" fill="#f8c8d8"/>
        <ellipse cx="31" cy="16" rx="12" ry="10" fill="#fcd8e4"/>
        {[0,72,144,216,288].map((a,i)=>(
          <ellipse key={i} cx={31+10*Math.cos(a*Math.PI/180)} cy={16+7*Math.sin(a*Math.PI/180)} rx="5" ry="3" fill="#f090b0"
            transform={`rotate(${a},${31+10*Math.cos(a*Math.PI/180)},${16+7*Math.sin(a*Math.PI/180)})`}/>
        ))}
        <rect x="27" y="42" width="8" height="22" rx="2" fill="#8b5a2a"/>
        <ellipse cx="31" cy="66" rx="11" ry="3" fill="#00000015"/>
      </svg>
    );
    case "well": return (
      <svg width={w} height={h} viewBox="0 0 50 52">
        <ellipse cx="25" cy="46" rx="18" ry="5" fill="#00000015"/>
        <rect x="6"  y="22" width="38" height="22" rx="4" fill="#c8a870" stroke="#a08050" strokeWidth="1.5"/>
        <ellipse cx="25" cy="22" rx="19" ry="7" fill="#b89860" stroke="#a08050" strokeWidth="1"/>
        <ellipse cx="25" cy="22" rx="12" ry="4" fill="#2a4a6a" opacity="0.85"/>
        <rect x="4"  y="9"  width="4"  height="15" rx="1" fill="#8b6a3a"/>
        <rect x="42" y="9"  width="4"  height="15" rx="1" fill="#8b6a3a"/>
        <rect x="2"  y="7"  width="46" height="5" rx="2" fill="#a08050"/>
        <line x1="25" y1="7" x2="25" y2="22" stroke="#888" strokeWidth="1.5"/>
      </svg>
    );
    case "moon": return (
      <svg width={w} height={h} viewBox="0 0 54 54">
        <circle cx="27" cy="27" r="22" fill="#f8d860" opacity="0.25"/>
        <circle cx="27" cy="27" r="17" fill="#fde878"/>
        <circle cx="33" cy="21" r="11" fill="#EAF1F4"/>
        <circle cx="20" cy="16" r="3" fill="#fce060" opacity="0.5"/>
        <circle cx="36" cy="36" r="2" fill="#fce060" opacity="0.4"/>
      </svg>
    );
    default: return <div style={{fontSize:28}}>🌿</div>;
  }
}

// ── Isometric constants ───────────────────────────────────────
const TW = 72, TH = 36, COLS = 8, ROWS = 6;

function isoToScreen(gx, gy) {
  return {
    x: (gx - gy) * TW / 2,
    y: (gx + gy) * TH / 2,
  };
}

// ── HirobaPage ────────────────────────────────────────────────
function HirobaPage({ diaries, t }) {
  const leafCount = Object.values(diaries).filter(d => d?.messages?.some(m => m.role === "user")).length;
  const [placedItems, setPlacedItems]   = useState([]);
  const [inventory, setInventory]       = useState([]);
  const [newUnlocks, setNewUnlocks]     = useState([]);
  const [showInventory, setShowInventory] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoverCell, setHoverCell]       = useState(null);
  const [showDevMenu, setShowDevMenu]   = useState(false);
  const [devOffset, setDevOffset]       = useState(0);
  const prevCount = useRef(0);
  const longPress = useRef(null);

  const display = leafCount + devOffset;

  const startLP = () => { longPress.current = setTimeout(() => setShowDevMenu(v => !v), 800); };
  const endLP   = () => clearTimeout(longPress.current);

  useEffect(() => {
    storage.get("hiroba-v3").then(r => {
      if (r) { const s = JSON.parse(r.value); setPlacedItems(s.p||[]); setInventory(s.i||[]); }
    }).catch(()=>{});
  }, []);

  const persist = (p, i) => storage.set("hiroba-v3", JSON.stringify({p,i})).catch(()=>{});

  useEffect(() => {
    if (prevCount.current === display) return;
    const newIds = ITEMS.filter(it => display >= it.unlockAt && !placedItems.some(p=>p.id===it.id) && !inventory.includes(it.id)).map(it=>it.id);
    if (newIds.length) {
      const inv2 = [...new Set([...inventory, ...newIds])];
      setInventory(inv2); setNewUnlocks(newIds); persist(placedItems, inv2);
    }
    prevCount.current = display;
  }, [display]);

  const nextItem = ITEMS.filter(i => i.unlockAt > display).sort((a,b)=>a.unlockAt-b.unlockAt)[0];
  const prevUnlock = ITEMS.filter(i => i.unlockAt <= display).slice(-1)[0];
  const progress = nextItem ? ((display-(prevUnlock?.unlockAt||0))/(nextItem.unlockAt-(prevUnlock?.unlockAt||0)))*100 : 100;
  const invItems = ITEMS.filter(i => inventory.includes(i.id));

  const placeItem = (gx, gy) => {
    if (!selectedItem) return;
    if (placedItems.some(p => p.gx===gx && p.gy===gy)) return;
    const p2 = [...placedItems, { uid:Date.now(), id:selectedItem, gx, gy }];
    const i2 = inventory.filter(x => x !== selectedItem);
    setPlacedItems(p2); setInventory(i2); setSelectedItem(null); persist(p2, i2);
  };

  const removeItem = (uid) => {
    const item = placedItems.find(p => p.uid===uid);
    if (!item) return;
    const p2 = placedItems.filter(p => p.uid!==uid);
    const i2 = [...new Set([...inventory, item.id])];
    setPlacedItems(p2); setInventory(i2); persist(p2, i2);
  };

  // Canvas geometry
  const padX = ROWS * TW / 2 + 40;
  const padY = 40;
  const svgW = (COLS + ROWS) * TW / 2 + 80;
  const svgH = (COLS + ROWS) * TH / 2 + 160;

  // All tiles sorted for painting
  const tiles = [];
  for (let gy = 0; gy < ROWS; gy++)
    for (let gx = 0; gx < COLS; gx++)
      tiles.push({gx, gy});

  const sorted = [...placedItems].sort((a,b) => (a.gx+a.gy)-(b.gx+b.gy));

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#EAF1F4" }}>

      {/* Header */}
      <div style={{ padding:"12px 18px 8px", borderBottom:`1px solid ${t.color}20`, background:"#EAF1F4", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div onMouseDown={startLP} onMouseUp={endLP} onMouseLeave={endLP} onTouchStart={startLP} onTouchEnd={endLP} style={{ userSelect:"none" }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#1a2a32" }}>🍂 言の葉広場</div>
            <div style={{ fontSize:10, color:"#7a9aaa", marginTop:1 }}>{display}枚の言の葉</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {selectedItem && (
              <button onClick={()=>setSelectedItem(null)} style={{ background:"#c4687e18", border:"1px solid #c4687e44", borderRadius:10, padding:"5px 12px", cursor:"pointer", color:"#c4687e", fontSize:11, fontFamily:"inherit" }}>✕ キャンセル</button>
            )}
            <button onClick={()=>setShowInventory(v=>!v)} style={{ background:showInventory?`${t.color}20`:"#ffffff70", border:`1px solid ${showInventory?t.accent+"44":"#00000015"}`, borderRadius:10, padding:"5px 12px", cursor:"pointer", color:showInventory?t.accent:"#5a7a8a", fontSize:11, fontFamily:"inherit" }}>
              🎒 持ち物{invItems.length?` (${invItems.length})`:""}
            </button>
          </div>
        </div>
        {nextItem && (
          <div style={{ marginTop:7 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#7a9aaa", marginBottom:3 }}>
              <span>次: {nextItem.name}（{nextItem.unlockAt}枚）</span><span>{display}/{nextItem.unlockAt}</span>
            </div>
            <div style={{ height:3, background:"#00000010", borderRadius:4, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:4, background:`linear-gradient(90deg,${t.color},${t.accent})`, width:`${Math.min(progress,100)}%`, transition:"width 0.6s cubic-bezier(0.4,0,0.2,1)" }}/>
            </div>
          </div>
        )}
      </div>

      {/* Unlock notice */}
      {newUnlocks.length>0 && (
        <div style={{ background:`linear-gradient(135deg,${t.color}28,${t.accent}18)`, border:`1px solid ${t.color}35`, padding:"9px 18px", fontSize:12, color:"#2a4a5a", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <span style={{ fontSize:16 }}>🎉</span>
          <span>新アイテム！ {newUnlocks.map(id=>ITEMS.find(i=>i.id===id)?.name).join("・")}</span>
          <button onClick={()=>setNewUnlocks([])} style={{ marginLeft:"auto", background:"transparent", border:"none", cursor:"pointer", color:"#aaa", fontSize:13 }}>✕</button>
        </div>
      )}

      {/* Inventory */}
      <div style={{ overflow:"hidden", maxHeight:showInventory?"160px":"0px", opacity:showInventory?1:0, transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)", background:"#ffffff80", borderBottom:"1px solid #00000008", flexShrink:0 }}>
        <div style={{ padding:"10px 16px" }}>
          <div style={{ fontSize:11, color:"#7a9aaa", marginBottom:8 }}>
            {selectedItem ? `「${ITEMS.find(i=>i.id===selectedItem)?.name}」を置く場所をタップ` : "アイテムを選んで広場に配置しよう"}
          </div>
          {invItems.length ? (
            <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {invItems.map(item=>(
                <button key={item.id} onClick={()=>{ setSelectedItem(item.id); setShowInventory(false); }} style={{
                  flexShrink:0, background:selectedItem===item.id?`${t.color}28`:"#ffffff90",
                  border:`2px solid ${selectedItem===item.id?t.accent:"#00000012"}`,
                  borderRadius:12, padding:"8px 10px", cursor:"pointer", textAlign:"center",
                  transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
                }}>
                  <ItemSvg id={item.id} w={item.w} h={item.h}/>
                  <div style={{ fontSize:10, color:"#5a7a8a", marginTop:4, whiteSpace:"nowrap" }}>{item.name}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color:"#bbb", fontSize:12, textAlign:"center", padding:"8px 0" }}>日記を書いてアイテムを集めよう🍂</div>
          )}
        </div>
      </div>

      {/* Place hint bar */}
      {selectedItem && (
        <div style={{ background:`${t.color}18`, padding:"7px 16px", fontSize:12, color:t.accent, textAlign:"center", flexShrink:0, borderBottom:`1px solid ${t.color}20` }}>
          広場のマスをタップ →「{ITEMS.find(i=>i.id===selectedItem)?.name}」を配置
        </div>
      )}

      {/* Coming soon */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        background:"linear-gradient(180deg, #dceef5 0%, #EAF1F4 100%)",
        position:"relative", overflow:"hidden",
      }}>
        {/* Floating leaves animation */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden" }}>
          {["🍂","🍁","🍃","🍂","🍁","🍃","🍂"].map((emoji,i)=>(
            <div key={i} style={{
              position:"absolute",
              left:`${10+i*13}%`,
              top:0,
              fontSize:24+i%3*8,
              animation:`leafFall${i%4} ${7+i*0.8}s ${i*1.2}s infinite ease-in-out`,
              willChange:"transform",
              transform:"translateY(-60px)",
            }}>{emoji}</div>
          ))}
        </div>
        {/* Message card */}
        <div style={{
          zIndex:10, textAlign:"center",
          background:"rgba(255,255,255,0.82)",
          backdropFilter:"blur(12px)",
          borderRadius:24, padding:"32px 40px",
          border:"1px solid rgba(255,255,255,0.6)",
          boxShadow:"0 8px 32px rgba(0,0,0,0.08)",
          margin:"0 24px",
        }}>
          <div style={{ fontSize:24, marginBottom:8 }}>🌿</div>
          <div style={{ fontSize:14, fontWeight:600, color:"#5a7a8a", letterSpacing:"0.12em" }}>COMING SOON</div>
        </div>
        {/* Leaf pile */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, textAlign:"center", fontSize:13, color:"#7a9aaa", paddingBottom:12 }}>
          {display > 0 && `🍂 ${display}枚の言の葉が集まっています`}
        </div>
      </div>
      {/* Dev menu */}
      {showDevMenu && (
        <div style={{ background:"#1a2a32", borderTop:"2px solid #c4687e", padding:"12px 18px", flexShrink:0, animation:"fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:11, color:"#c4687e", fontWeight:700, letterSpacing:"0.1em" }}>🛠 DEVELOPER MODE</div>
            <button onClick={()=>setShowDevMenu(false)} style={{ background:"transparent", border:"none", color:"#666", cursor:"pointer", fontSize:14 }}>✕</button>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {[-20,-10,-5,-1].map(n=>(
              <button key={n} onClick={()=>setDevOffset(v=>v+n)} style={{ flex:1, padding:"7px 0", background:"#c4687e22", border:"1px solid #c4687e44", borderRadius:8, color:"#e8a4b8", cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600 }}>{n}</button>
            ))}
            <div style={{ width:1, background:"#ffffff10", flexShrink:0 }}/>
            {[1,5,10,20].map(n=>(
              <button key={n} onClick={()=>setDevOffset(v=>v+n)} style={{ flex:1, padding:"7px 0", background:"#4a8c3f22", border:"1px solid #4a8c3f44", borderRadius:8, color:"#b8d4a4", cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600 }}>+{n}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
            <div style={{ fontSize:12, color:"#ccc" }}>
              実際: <span style={{ color:"#7eb8d4" }}>{leafCount}</span> 
              オフセット: <span style={{ color:"#e8a4b8" }}>{devOffset>=0?"+":""}{devOffset}</span> 
              表示: <span style={{ color:"#b8d4a4", fontWeight:700 }}>{display}</span>
            </div>
            <button onClick={()=>setDevOffset(0)} style={{ padding:"4px 12px", background:"#ffffff10", border:"1px solid #ffffff20", borderRadius:8, color:"#888", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>リセット</button>
          </div>
        </div>
      )}
    </div>
  );
}



// ── Bubble ───────────────────────────────────────────────────
function Bubble({ msg, t }) {
  const isUser = msg.role==="user";
  return (
    <div style={{ display:"flex",flexDirection:isUser?"row-reverse":"row",alignItems:"flex-end",gap:8,animation:"fadeUp 0.4s cubic-bezier(0.4,0,0.2,1)" }}>
      {!isUser&&(
        <div style={{ width:30,height:30,borderRadius:"50%",flexShrink:0,background:`${t.color}18`,border:`1px solid ${t.color}2a`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>{t.icon}</div>
      )}
      <div style={{
        maxWidth:"76%",
        background:isUser?`${t.color}50`:msg.toneChange?"#00000006":"#ffffff70",
        border:isUser?`1px solid ${t.color}60`:"1px solid #00000010",
        borderRadius:isUser?"16px 16px 3px 16px":"16px 16px 16px 3px",
        padding:"11px 14px",color:isUser?"#2a3d48":"#2a3d48",
        fontSize:13.5,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word",
      }}>{msg.content}</div>
    </div>
  );
}

// ── Summary Modal ─────────────────────────────────────────────
function SummaryModal({ summary, loading, onClose, closing, t, dateLabel }) {
  const sections = [];
  if (!loading && summary) {
    const defs = [
      { key:"できごと", icon:"📅", label:"その日のできごと", color:"#2a7fa8" },
      { key:"気持ち",   icon:"💭", label:"気持ち・感情",     color:"#c4687e" },
      { key:"まとめ",   icon:"✨", label:"気づき・まとめ",   color:"#4a8c3f" },
    ];
    const parts = summary.split("【").filter(Boolean);
    defs.forEach(({ key, icon, label, color }) => {
      const part = parts.find(p => p.includes(key));
      if (!part) return;
      const content = part.split("】").slice(1).join("】").trim();
      if (content) sections.push({ icon, label, color, content });
    });
  }
  return (
    <div style={{ position:"fixed",inset:0,zIndex:100,background:"rgba(180,210,220,0.5)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",opacity:closing?0:1,transition:"opacity 0.35s cubic-bezier(0.4,0,0.2,1)" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%",maxWidth:660,background:"#f4f9fb",
        borderRadius:"24px",boxShadow:"0 8px 48px rgba(0,0,0,0.14)",
        animation:closing?"slideDown 0.35s cubic-bezier(0.4,0,0.2,1) forwards":"slideUp 0.45s cubic-bezier(0.34,1.56,0.64,1)",
        maxHeight:"80vh",display:"flex",flexDirection:"column",marginBottom:"80px",
      }}>
        <div style={{ display:"flex",justifyContent:"center",padding:"12px 0 4px" }}>
          <div style={{ width:36,height:4,borderRadius:2,background:"#00000015" }}/>
        </div>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 32px 20px" }}>
          <div>
            <div style={{ fontSize:17,fontWeight:800,color:"#1a2a32" }}>{dateLabel}のまとめ</div>
            <div style={{ fontSize:11,color:"#7a9aaa",marginTop:2 }}>AIによる会話の要約</div>
          </div>
          <button onClick={onClose} style={{ background:"#00000008",border:"none",borderRadius:"50%",color:"#7a9aaa",width:32,height:32,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ height:1,background:"#00000008",margin:"0 32px" }}/>
        <div style={{ overflowY:"auto",padding:"24px 32px 64px" }}>
          {loading?(
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"40px 0" }}>
              <div style={{ display:"flex",gap:8 }}>
                {[0,1,2].map(i=>(<div key={i} style={{ width:8,height:8,borderRadius:"50%",background:t.color,animation:`bounce 1.2s ${i*0.18}s infinite ease-in-out` }}/>))}
              </div>
              <span style={{ color:"#7a9aaa",fontSize:13 }}>会話を分析中…</span>
            </div>
          ):sections.length>0?(
            <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
              {sections.map((sec,i)=>(
                <div key={i} style={{ background:"#ffffff",border:`1px solid ${sec.color}20`,borderRadius:16,padding:"16px 18px",borderLeft:`4px solid ${sec.color}` }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                    <span style={{ fontSize:18 }}>{sec.icon}</span>
                    <span style={{ fontSize:12,fontWeight:700,color:sec.color }}>{sec.label}</span>
                  </div>
                  <div style={{ fontSize:13.5,lineHeight:1.85,color:"#2a3d48",whiteSpace:"pre-wrap" }}>{sec.content}</div>
                </div>
              ))}
            </div>
          ):(
            <div style={{ fontSize:13.5,lineHeight:1.85,color:"#2a3d48",whiteSpace:"pre-wrap" }}>{summary}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stats Page ────────────────────────────────────────────────
function StatsPage({ diaries, t }) {
  const [period, setPeriod] = useState("week");
  const [chartVisible, setChartVisible] = useState(true);

  const changePeriod = (newPeriod) => {
    if (newPeriod === period) return;
    setChartVisible(false);
    setTimeout(() => {
      setPeriod(newPeriod);
      setChartVisible(true);
    }, 200);
  };

  const now = new Date();
  const periodDays = period==="week" ? 7 : period==="month" ? 30 : 90;
  const periodLabel = period==="week" ? "1週間" : period==="month" ? "1ヶ月" : "3ヶ月";

  const allEntries = Object.keys(diaries)
    .filter(ds => diaries[ds]?.score!=null)
    .sort();

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = fmt(cutoff);

  const entries = allEntries
    .filter(ds => ds >= cutoffStr)
    .map(ds => {
      const d = new Date(ds+"T00:00:00");
      const label = period==="week"
        ? `${d.getMonth()+1}/${d.getDate()}`
        : period==="month"
        ? `${d.getDate()}日`
        : `${d.getMonth()+1}/${d.getDate()}`;
      return { ds, date: label, score: diaries[ds].score, label: diaries[ds].scoreLabel||"" };
    });

  const totalDays = Object.values(diaries).filter(d=>d?.messages?.some(m=>m.role==="user")).length;
  const scores = entries.map(e=>e.score);
  const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const worst = scores.length ? Math.min(...scores) : null;

  const scoreColor = (s) => s>=8?"#4a8c3f":s>=6?"#2a7fa8":s===5?"#9a9aaa":s>=3?"#d4856a":"#c4687e";

  // Always fill available width - calculate step from container
  const maxW = 580; // max chart width (matches maxWidth of parent)
  const usableW = maxW - 60; // subtract axis margin
  const barStep = entries.length > 1 ? usableW / (entries.length - 1) : usableW;
  const svgW = maxW;
  const svgH = 160;
  const chartH = 110;
  const chartTop = 16;

  return (
    <div style={{ padding:"20px 16px", overflowY:"auto", flex:1 }}>
      <div style={{ fontSize:18, fontWeight:800, color:"#1a2a32", marginBottom:16 }}>気分の統計</div>

      {/* Period selector */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[
          { key:"week",   label:"1週間" },
          { key:"month",  label:"1ヶ月" },
          { key:"3month", label:"3ヶ月" },
        ].map(p=>(
          <button key={p.key} onClick={()=>changePeriod(p.key)} style={{
            flex:1, padding:"8px 0", borderRadius:10, fontFamily:"inherit",
            border: period===p.key ? `2px solid ${t.accent}` : "2px solid transparent",
            background: period===p.key ? `${t.color}20` : "#ffffff70",
            color: period===p.key ? t.accent : "#7a9aaa",
            fontSize:13, fontWeight: period===p.key ? 700 : 400,
            cursor:"pointer", transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}>{p.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        {[
          { label:"記録日数", value: totalDays+"日", color:"#1a2a32" },
          { label:`${periodLabel}平均`, value: avg!=null?`${avg}/10`:"--", color: avg!=null?scoreColor(Math.round(avg)):"#7a9aaa" },
          { label:`${periodLabel}最高`, value: best!=null?`${best}/10`:"--", color: best!=null?scoreColor(best):"#7a9aaa" },
        ].map((card,i)=>(
          <div key={i} style={{ background:"#ffffff80", border:"1px solid #00000010", borderRadius:14, padding:"14px 10px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#7a9aaa", marginBottom:6 }}>{card.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:"#ffffff80", border:"1px solid #00000010", borderRadius:16, padding:"16px 8px 8px", marginBottom:16 }}>
        <div style={{ fontSize:12, color:"#7a9aaa", marginBottom:12, paddingLeft:8 }}>
          気分スコア推移（{periodLabel}）
        </div>
        <div style={{
          opacity:chartVisible?1:0,
          transform:chartVisible?"translateY(0)":"translateY(8px)",
          transition:"opacity 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}>
        {entries.length > 0 ? (
          <div style={{ overflowX:"auto" }}>
            <svg width={svgW} height={svgH} style={{ display:"block", minWidth:"100%" }}>
              {/* Grid lines */}
              {[10,8,6,4,2].map((v,vi)=>{
                const y = chartTop + (10-v) / 9 * chartH;
                return (
                  <g key={v}>
                    <line x1="36" y1={y} x2={svgW-8} y2={y}
                      stroke={v===5?"#00000025":"#00000010"}
                      strokeWidth={v===5?1.5:1}
                      strokeDasharray={v===5?"none":"3"}/>
                    <text x="32" y={y+4} textAnchor="end" fontSize="9" fill="#aaa">{v}</text>
                  </g>
                );
              })}

              {/* Line connecting bars */}
              {entries.length > 1 && (
                <polyline
                  points={entries.map((e,i)=>{
                    const x = entries.length===1 ? svgW/2 : 36 + i * barStep;
                    const y = chartTop + (10-e.score)/9*chartH;
                    return `${x},${y}`;
                  }).join(" ")}
                  fill="none" stroke={t.color} strokeWidth="1.5" opacity="0.5" strokeLinejoin="round"
                />
              )}

              {/* Dots + bars */}
              {entries.map((e,i)=>{
                const x = entries.length===1 ? svgW/2 : 36 + i * barStep;
                const y = chartTop + (10-e.score)/9*chartH;
                const col = scoreColor(e.score);
                const barY = y;
                const barH = chartTop + chartH - barY;
                return (
                  <g key={i}>
                    {/* Bar from score to bottom */}
                    {/* Bar */}
                    <rect x={x - Math.min(barStep*0.3, 8)} y={barY}
                      width={Math.min(barStep*0.6, 16)} height={Math.max(barH,3)}
                      rx={3} fill={col} opacity={0.22}/>
                    {/* Dot */}
                    <circle cx={x} cy={y}
                      r={Math.min(Math.max(barStep*0.15, 2), 5)}
                      fill={col} stroke="#fff"
                      strokeWidth={barStep > 30 ? 1.5 : 1}/>
                    {/* Score label - only when enough space */}
                    {barStep >= 35 && (
                      <text x={x} y={Math.max(y-8, 10)} textAnchor="middle"
                        fontSize="9" fill={col} fontWeight="700">{e.score}</text>
                    )}
                    {/* Date label - skip based on density */}
                    {(i === 0 || i === entries.length-1 || (barStep >= 35) || (barStep >= 15 && i % Math.ceil(7/barStep*15) === 0) || (barStep < 15 && i % Math.ceil(14/barStep*15) === 0)) && (
                      <text x={x} y={svgH-4} textAnchor="middle"
                        fontSize="7.5" fill="#aaa">{e.date}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"40px 0" }}>
            {periodLabel}のデータがありません
          </div>
        )}
        </div>
      </div>

      {/* Score legend */}
      <div style={{ background:"#ffffff80", border:"1px solid #00000010", borderRadius:14, padding:"14px 16px" }}>
        <div style={{ fontSize:11, color:"#7a9aaa", marginBottom:10 }}>気分スコアの目安</div>
        {[
          { range:"8〜10", label:"とても良い日", color:"#4a8c3f" },
          { range:"6〜7",  label:"まあまあ良い", color:"#2a7fa8" },
          { range:"5",     label:"普通",         color:"#9a9aaa" },
          { range:"3〜4",  label:"少し辛い",     color:"#d4856a" },
          { range:"1〜2",  label:"辛い日",       color:"#c4687e" },
        ].map((item,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ width:32, fontSize:10, color:item.color, fontWeight:700 }}>{item.range}</div>
            <div style={{ width:6, height:6, borderRadius:"50%", background:item.color, flexShrink:0 }}/>
            <div style={{ fontSize:12, color:"#5a7a8a" }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}



const navBtnStyle = { background:"transparent",border:"1px solid #1e1e1e",borderRadius:8,color:"#5a7a8a",width:28,height:28,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",padding:0 };

// ── Main App ──────────────────────────────────────────────────

// ── Auth Screen ───────────────────────────────────────────────
function AuthScreen({ t }) {
  const [mode, setMode] = useState("login"); // login / signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) { setError("メールアドレスとパスワードを入力してください"); return; }
    setError(""); setLoading(true);
    try {
      if (mode === "signup") {
        await fbSignUp(email, password);
      } else {
        await fbSignIn(email, password);
      }
    } catch(e) {
      const raw = e.message || e.code || "";
      const msg = raw.includes("EMAIL_EXISTS") ? "このメールはすでに使われています"
        : raw.includes("INVALID_LOGIN_CREDENTIALS") || raw.includes("INVALID_PASSWORD") || raw.includes("EMAIL_NOT_FOUND") ? "メールまたはパスワードが違います"
        : raw.includes("WEAK_PASSWORD") ? "パスワードは6文字以上にしてください"
        : raw.includes("INVALID_EMAIL") ? "メールアドレスの形式が正しくありません"
        : raw.includes("TOO_MANY_ATTEMPTS") ? "試行回数が多すぎます。しばらく待ってください"
        : "エラー: " + raw;
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#EAF1F4",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",
      padding:"24px",
    }}>
      <div style={{ marginBottom:32, textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🍂</div>
        <div style={{ fontSize:26, fontWeight:800, color:"#1a2a32", letterSpacing:"-0.5px" }}>言の葉</div>
        <div style={{ fontSize:12, color:"#7a9aaa", marginTop:4 }}>気持ちを言葉に</div>
      </div>

      <div style={{
        width:"100%", maxWidth:380,
        background:"#ffffff90", borderRadius:20,
        border:"1px solid #00000010",
        padding:"28px 24px",
        boxShadow:"0 8px 32px rgba(0,0,0,0.08)",
      }}>
        {/* Tab */}
        <div style={{ display:"flex", background:"#EAF1F4", borderRadius:12, padding:4, marginBottom:24, gap:4 }}>
          {[{key:"login",label:"ログイン"},{key:"signup",label:"新規登録"}].map(tab=>(
            <button key={tab.key} onClick={()=>{ setMode(tab.key); setError(""); }} style={{
              flex:1, padding:"8px", borderRadius:10, border:"none",
              background:mode===tab.key?"#fff":"transparent",
              color:mode===tab.key?"#1a2a32":"#7a9aaa",
              fontWeight:mode===tab.key?700:400,
              fontSize:13, cursor:"pointer", fontFamily:"inherit",
              boxShadow:mode===tab.key?"0 2px 8px rgba(0,0,0,0.08)":"none",
              transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:"#7a9aaa", marginBottom:6 }}>メールアドレス</div>
          <input
            type="email" value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            placeholder="example@email.com"
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #00000015",
              background:"#f8fafb", color:"#1a2a32", fontSize:14, fontFamily:"inherit",
              outline:"none", boxSizing:"border-box" }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, color:"#7a9aaa", marginBottom:6 }}>パスワード{mode==="signup"&&"（6文字以上）"}</div>
          <input
            type="password" value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            placeholder="••••••••"
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #00000015",
              background:"#f8fafb", color:"#1a2a32", fontSize:14, fontFamily:"inherit",
              outline:"none", boxSizing:"border-box" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#fde8e8", border:"1px solid #f4a0a0", borderRadius:10,
            padding:"10px 14px", fontSize:12, color:"#c44", marginBottom:16 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%", padding:"13px", borderRadius:12, border:"none",
          background:loading?"#ccc":t.accent,
          color:"#fff", fontSize:14, fontWeight:700,
          cursor:loading?"default":"pointer", fontFamily:"inherit",
          transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {loading ? "処理中..." : mode==="login" ? "ログイン" : "アカウント作成"}
        </button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#aaa" }}>
          データはクラウドに安全に保存されます 🔒
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"16px 0" }}>
          <div style={{ flex:1, height:1, background:"#00000010" }}/>
          <span style={{ fontSize:11, color:"#ccc" }}>または</span>
          <div style={{ flex:1, height:1, background:"#00000010" }}/>
        </div>

        <button onClick={()=>fbGuestLogin()} style={{
          width:"100%", padding:"12px", borderRadius:12, border:"1px solid #00000015",
          background:"#ffffff80", color:"#7a9aaa", fontSize:13,
          cursor:"pointer", fontFamily:"inherit",
        }}>
          ゲストとして参加（データは端末のみに保存）
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);      // Firebase user
  const [authReady, setAuthReady] = useState(false); // auth check done
  const [diaries, setDiaries] = useState({});
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("diary");
  const [tone, setTone] = useState("empathy");
  const [selected, setSelected] = useState(TODAY);
  const [showTones, setShowTones] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClosing, setSummaryClosing] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showScoreEditor, setShowScoreEditor] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const bottomRef = useRef(null);
  const textRef = useRef(null);
  const idRef = useRef(1);
  const isComposing = useRef(false);
  const isTouchDevice = useRef(
    typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );

  // ── iOS keyboard + chat focus mode ────────────────────────
  const [vpHeight, setVpHeight] = useState(
    () => (typeof window !== "undefined" ? (window.visualViewport?.height || window.innerHeight) : 800)
  );
  const [vpTop, setVpTop] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const chatAreaRef = useRef(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVpHeight(vv.height);
      setVpTop(vv.offsetTop);
      setIsKeyboardOpen(vv.height < window.screen.height * 0.75);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  // Track scroll position to show/hide "latest" button
  const handleChatScroll = () => {
    const el = chatAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottom.current = distFromBottom < 60;
    setShowScrollBtn(distFromBottom > 120);
  };

  const scrollToBottom = (smooth = true) => {
    const el = chatAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const t = TONES[tone];

  useEffect(()=>{
    let unsub;
    onAuthChange(async (fbUser) => {
      setUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        try {
          const [cloudDiaries, localDiaries] = await Promise.all([
            fbLoadDiaries(fbUser.uid), loadData()
          ]);
          const merged = Object.keys(cloudDiaries).length > 0
            ? { ...localDiaries, ...cloudDiaries }
            : localDiaries;
          setDiaries(merged);
        } catch(e) {
          const local = await loadData();
          setDiaries(local);
        }
      } else {
        const local = await loadData();
        setDiaries(local);
      }
      setReady(true);
    }).then(fn => { unsub = fn; });
    return () => unsub && unsub();
  },[]);
  useEffect(()=>{
    if(!ready) return;
    saveData(diaries);
    if(user) fbSaveDiaries(user.uid, diaries).catch(()=>{});
  },[diaries,ready]);
  useEffect(()=>{
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),60);
  },[diaries,selected,loading]);

  useEffect(()=>{
    if(!ready) return;
    setDiaries(prev=>{
      if(prev[selected]?.messages?.length) return prev;
      const isPast=selected<TODAY;
      const welcome={ id:idRef.current++, role:"assistant",
        content:isPast?`${dayLabel(selected)}のことを聞かせてください。\nあの日はどんな一日でしたか？ ${t.icon}`:`今日はどんな一日でしたか？\nゆっくり話してください。 ${t.icon}` };
      return { ...prev, [selected]:{ messages:[welcome], tone } };
    });
  },[selected,ready]);

  const msgs = diaries[selected]?.messages||[];
  const isPast = selected<TODAY;
  const hasUserMsgs = msgs.some(m=>m.role==="user");
  const totalDays = Object.values(diaries).filter(d=>d?.messages?.some(m=>m.role==="user")).length;

  const changeTone = (newTone)=>{
    setTone(newTone); setShowTones(false);
    const notice={ id:idRef.current++,role:"assistant",toneChange:true,content:`（${TONES[newTone].icon} ${TONES[newTone].label}モードに切り替えました）` };
    setDiaries(prev=>({ ...prev,[selected]:{ messages:[...(prev[selected]?.messages||[]),notice],tone:newTone } }));
  };

  const analyzeScore = async (dateKey, messages) => {
    try {
      const conv = messages.filter(m=>!m.toneChange).map(m=>`${m.role==="user"?"ユーザー":"AI"}: ${m.content}`).join("\n");
      const raw = await callAPI(SCORE_SYSTEM, [{ role:"user", content:conv }]);
      const clean = raw.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      // Convert: if score is in old -5/+5 scale, convert to 1-10
      let score = parseInt(parsed.score);
      if (score < 0) score = Math.max(1, Math.round((score + 5) / 10 * 9) + 1);
      if (score > 10) score = 10;
      if (score < 1) score = 1;
      const scoreLabel = score>=8?"とても良い":score>=6?"良い":score===5?"普通":score>=3?"少し辛い":"辛い";
      setDiaries(d=>({ ...d,[dateKey]:{ ...d[dateKey],score,scoreLabel } }));
    } catch(e){ console.error("score error",e); }
  };

  const closeSummary = () => {
    setSummaryClosing(true);
    setTimeout(() => { setShowSummary(false); setSummaryClosing(false); }, 350);
  };

  const openSummary = async ()=>{
    setShowSummary(true); setSummary(""); setSummaryLoading(true);
    try {
      const conv = msgs.filter(m=>!m.toneChange).map(m=>`${m.role==="user"?"ユーザー":"AI"}: ${m.content}`).join("\n");
      const result = await callAPI(SUMMARY_SYSTEM,[{ role:"user",content:`以下は${dayLabel(selected)}の会話です：\n\n${conv}` }]);
      setSummary(result);
    } catch { setSummary("要約の取得に失敗しました。"); }
    finally { setSummaryLoading(false); }
  };

  const send = async ()=>{
    if(!input.trim()||loading) return;
    const dateKey=selected, toneKey=tone;
    const userMsg={ id:idRef.current++,role:"user",content:input.trim() };
    const prevMsgs=diaries[dateKey]?.messages||[];
    const updated=[...prevMsgs,userMsg];
    setDiaries(d=>({ ...d,[dateKey]:{ ...d[dateKey],messages:updated,tone:toneKey } }));
    setInput("");
    if(textRef.current) textRef.current.style.height="auto";
    setLoading(true);
    try {
      const apiMsgs=updated.filter(m=>!m.toneChange).map(m=>({ role:m.role,content:m.content }));
      const reply = await callAPI(TONES[toneKey].system(dayLabel(dateKey)),apiMsgs);
      const aiMsg={ id:idRef.current++,role:"assistant",content:reply };
      setDiaries(d=>({ ...d,[dateKey]:{ ...d[dateKey],messages:[...(d[dateKey]?.messages||updated),aiMsg],tone:toneKey } }));
      // Analyze mood score in background after reply
      analyzeScore(dateKey,[...updated,aiMsg]);
    } catch(e) {
      const errMsg={ id:idRef.current++,role:"assistant",content:`接続エラー: ${e.message}` };
      setDiaries(d=>({ ...d,[dateKey]:{ ...d[dateKey],messages:[...(d[dateKey]?.messages||updated),errMsg],tone:toneKey } }));
    } finally { setLoading(false); }
  };

  const selectDateFromCalendar = (ds)=>{ setSelected(ds); setTab("diary"); };

  const hBtn = (active,color)=>({
    borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:11.5,fontFamily:"inherit",
    display:"flex",alignItems:"center",gap:5,transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
    background:active?`${color}18`:"transparent",
    border:`1px solid ${active?color+"44":"#B8CED8"}`,
    color:active?color:"#6a8a9a",
  });

  // ── Diary tab content
  const DiaryTab = (
    <div style={{ display:"flex",flexDirection:"column",flex:1,overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${t.color}14`,background:"#EAF1F4",zIndex:30,flexShrink:0 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          {isKeyboardOpen ? (
            <div style={{ fontSize:13,fontWeight:700,color:"#2a4a5a" }}>
              {(()=>{ const d=new Date(selected+"T00:00:00"); return `${isPast?"📖":"✍️"} ${d.getMonth()+1}月${d.getDate()}日（${["日","月","火","水","木","金","土"][d.getDay()]}）`; })()}
            </div>
          ) : (
            <>
                <div style={{ fontSize:16,fontWeight:800,color:"#1a2a32",letterSpacing:"-0.5px" }}>言の葉</div>
                <div style={{ fontSize:9,color:"#7a9aaa",marginTop:1 }}>{totalDays>0?`${totalDays}日間の記録`:"気持ちを言葉に"}</div>
              <div style={{ width:1,height:32,background:"#00000010" }}/>
              <div>
                <div style={{ fontSize:12,fontWeight:700,color:"#2a4a5a" }}>
                  {(()=>{ const d=new Date(selected+"T00:00:00"); return `${d.getMonth()+1}月${d.getDate()}日`; })()}
                </div>
                <div style={{ fontSize:10,color:"#7a9aaa",marginTop:1 }}>
                  {(()=>{ const d=new Date(selected+"T00:00:00"); return ["日","月","火","水","木","金","土"][d.getDay()]+"曜日"; })()}
                </div>
              </div>
            </>
          )}
        </div>
        {!isKeyboardOpen && (
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            {hasUserMsgs&&(
              <button onClick={openSummary} style={{ ...hBtn(false,t.color),color:t.color,border:`1px solid ${t.color}35` }}>
                📋 まとめ
              </button>
            )}
            <button onClick={()=>setShowTones(v=>!v)} style={{ ...hBtn(showTones,t.color),fontWeight:600 }}>
              <span style={{ fontSize:11 }}>{t.icon}</span>
              <span style={{ fontSize:10 }}>スタイル</span>
              <span style={{ fontSize:8,opacity:0.55,marginLeft:1 }}>{showTones?"▲":"▼"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Tone panel - smooth slide down */}
      <div style={{
        overflow:"hidden",
        maxHeight:showTones?"80px":"0px",
        opacity:showTones?1:0,
        transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)",
        position:"sticky",top:49,zIndex:29,
      }}>
        <div style={{ background:"#D0E2EA",borderBottom:"1px solid #ffffff06",padding:"8px 14px",display:"flex",gap:8 }}>
          {Object.entries(TONES).map(([key,val])=>(
            <button key={key} onClick={()=>changeTone(key)} style={{
              flex:1,padding:"7px 6px",borderRadius:10,fontFamily:"inherit",
              border:tone===key?`2px solid ${val.accent}`:"2px solid #00000020",
              background:tone===key?`${val.color}22`:"#ffffff60",
              cursor:"pointer",color:tone===key?val.accent:"#2a4a5a",
              fontSize:12,fontWeight:tone===key?700:500,transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            }}>
              <span style={{ fontSize:16 }}>{val.icon}</span>
              <span>{val.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date bar */}
      {!isKeyboardOpen && <div style={{ padding:"8px 18px",background:"#E0ECF2",borderBottom:"1px solid #ffffff05",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:28 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <button onClick={()=>{setShowDatePicker(v=>!v);setShowScoreEditor(false);}} style={{
            background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",gap:5,padding:0,
          }}>
            <span style={{ fontSize:12.5,color:isPast?t.accent:"#2a4a5a",fontWeight:700 }}>
              {isPast?`📖 ${dayLabel(selected)}の日記`:"✍️ 今日の日記"}
            </span>
            <span style={{ fontSize:9,color:"#aaa" }}>▼</span>
          </button>
          {isPast&&<span style={{ fontSize:10,background:`${t.color}12`,color:t.color,border:`1px solid ${t.color}25`,borderRadius:8,padding:"2px 7px" }}>過去の記録</span>}
          <button onClick={()=>setShowScoreEditor(v=>!v)} style={{
              display:"flex",alignItems:"center",gap:4,
              background:showScoreEditor?`${t.color}20`:"transparent",
              border:`1px solid ${showScoreEditor?t.color+"44":"#00000015"}`,
              borderRadius:8,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit",
            }}>
              {diaries[selected]?.score!=null?(
                <span style={{ fontSize:11,fontWeight:700,color:diaries[selected].score>=8?"#4a8c3f":diaries[selected].score>=6?"#2a7fa8":diaries[selected].score<=2?"#c4687e":diaries[selected].score<5?"#d4856a":"#7a9aaa" }}>
                  {diaries[selected].score}/10
                </span>
              ):(
                <span style={{ fontSize:10,color:"#aaa" }}>気分</span>
              )}
              <span style={{ fontSize:9,color:"#aaa" }}>✏️</span>
            </button>
        </div>
        {selected!==TODAY&&(
          <button onClick={()=>setSelected(TODAY)} style={{ background:"transparent",border:"none",cursor:"pointer",color:"#7a9aaa",fontSize:11,fontFamily:"inherit" }}>今日に戻る →</button>
        )}
        </div>}

      {/* Score editor panel */}
      <div style={{
        overflow:"hidden",
        maxHeight:showScoreEditor?"120px":"0px",
        opacity:showScoreEditor?1:0,
        transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)",
        background:"#ffffff80",
        borderBottom:"1px solid #00000008",
      }}>
        <div style={{ padding:"12px 18px" }}>
          <div style={{ fontSize:11,color:"#5a7a8a",marginBottom:10 }}>
            気分スコアを手動で調整 <span style={{ color:"#bbb" }}>（AIの自動分析を上書き）</span>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:4 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(score=>{
              const isSel = diaries[selected]?.score===score;
              const color = score>=8?"#4a8c3f":score>=6?"#2a7fa8":score===5?"#5a7a8a":score>=3?"#d4856a":"#c4687e";
              return (
                <button key={score} onClick={()=>{
                  setDiaries(d=>({ ...d,[selected]:{ ...d[selected],score,scoreLabel:score>=8?"とても良い":score>=6?"良い":score===5?"普通":score>=3?"少し辛い":"辛い" } }));
                  setShowScoreEditor(false);
                }} style={{
                  flex:1,padding:"8px 0",borderRadius:8,border:"none",
                  background:isSel?`${color}25`:"#00000008",
                  color:isSel?color:"#aaa",
                  cursor:"pointer",fontSize:11,fontWeight:isSel?800:400,
                  fontFamily:"inherit",transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",
                  outline:isSel?`2px solid ${color}`:"none",
                }}>
                  {score}/10
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:"#bbb" }}>
            <span>😔 辛い</span><span>😐 普通</span><span>😊 良い</span>
          </div>
        </div>
      </div>

      {/* Date picker panel */}
      <div style={{
        overflow:"hidden",
        maxHeight:showDatePicker?"420px":"0px",
        opacity:showDatePicker?1:0,
        transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)",
        background:"#ffffff90",
        borderBottom:"1px solid #00000008",
        position:"relative",zIndex:20,
      }}>
        <div style={{ padding:"10px 16px 4px",fontSize:11,color:"#5a7a8a",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span>📅 日付を変更（会話データも移動します）</span>
          <button onClick={()=>setShowDatePicker(false)} style={{ background:"transparent",border:"none",cursor:"pointer",color:"#aaa",fontSize:16,lineHeight:1 }}>✕</button>
        </div>
        <DatePickerMini
          diaries={diaries}
          selected={selected}
          onSelect={(newDs)=>{
            if(newDs===selected){ setShowDatePicker(false); return; }
            // Move diary data to new date
            setDiaries(d=>{
              const current = d[selected];
              const target = d[newDs];
              const merged = target?.messages?.some(m=>m.role==="user")
                ? { ...target, messages:[...(target.messages||[]), ...(current?.messages?.filter(m=>m.role==="user")||[])] }
                : current;
              const next = { ...d, [newDs]: merged };
              delete next[selected];
              return next;
            });
            setSelected(newDs);
            setShowDatePicker(false);
          }}
          t={t}
        />
      </div>

      {/* Messages */}
      <div ref={chatAreaRef} onScroll={handleChatScroll} style={{ flex:1,padding:"20px 18px 8px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto",position:"relative" }}>
        {msgs.map(msg=><Bubble key={msg.id} msg={msg} t={t}/>)}
        {loading&&(
          <div style={{ display:"flex",alignItems:"flex-end",gap:8 }}>
            <div style={{ width:30,height:30,borderRadius:"50%",flexShrink:0,background:`${t.color}18`,border:`1px solid ${t.color}2a`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>{t.icon}</div>
            <div style={{ background:"#D8E8EE",border:"1px solid #ffffff08",borderRadius:"16px 16px 16px 3px",padding:"13px 16px",display:"flex",gap:5,alignItems:"center" }}>
              {[0,1,2].map(i=>(<div key={i} style={{ width:6,height:6,borderRadius:"50%",background:t.color,animation:`bounce 1.2s ${i*0.18}s infinite ease-in-out` }}/>))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {showScrollBtn && (
        <button onClick={()=>scrollToBottom()} style={{
          position:"absolute",bottom:"80px",right:"18px",zIndex:50,
          background:t.accent,color:"#fff",border:"none",
          borderRadius:"20px",padding:"6px 14px",
          fontSize:12,fontWeight:600,cursor:"pointer",
          boxShadow:"0 2px 12px rgba(0,0,0,0.18)",
          display:"flex",alignItems:"center",gap:5,
          fontFamily:"inherit",
        }}>↓ 最新へ</button>
      )}

      {/* Input */}
      <div style={{ padding:"6px 18px 8px",background:"#EAF1F4",borderTop:"1px solid #ffffff06",flexShrink:0,paddingBottom:isKeyboardOpen?"4px":`calc(8px + env(safe-area-inset-bottom,0px))` }}>

        <div style={{ display:"flex",gap:10,alignItems:"flex-end",background:"#D8E8EE",border:`1px solid ${t.color}22`,borderRadius:18,padding:"11px 14px" }}>
          <textarea
            ref={textRef}
            value={input}
            onChange={e=>{ setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,130)+"px"; }}
            onCompositionStart={()=>{ isComposing.current=true; }}
            onCompositionEnd={()=>{ isComposing.current=false; }}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey&&!isComposing.current&&!isTouchDevice.current){ e.preventDefault(); send(); } }}
            placeholder={isPast?`${dayLabel(selected)}のことを話してね…`:"今日のこと、気持ちを話してね…"}
            rows={1}
            style={{ flex:1,background:"transparent",border:"none",outline:"none",color:"#1a2a32",fontSize:13.5,lineHeight:1.65,resize:"none",fontFamily:"inherit",maxHeight:130,overflowY:"auto" }}
          />
          <button onClick={send} disabled={!input.trim()||loading} style={{
            width:36,height:36,borderRadius:"50%",border:"none",flexShrink:0,
            background:input.trim()&&!loading?t.accent:"#C8DCE6",
            cursor:input.trim()&&!loading?"pointer":"default",
            display:"flex",alignItems:"center",justifyContent:"center",
            transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",transform:input.trim()&&!loading?"scale(1)":"scale(0.88)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {!isKeyboardOpen && !isTouchDevice.current && <div style={{ fontSize:10,color:"#B8CED8",textAlign:"center",marginTop:6 }}>変換確定後にEnter で送信 · Shift+Enter で改行</div>}
      </div>
    </div>
  );

  // ── Auth gate ─────────────────────────────────────────────
  if (!authReady) return (
    <div style={{ minHeight:"100vh", background:"#EAF1F4", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🍂</div>
        <div style={{ fontSize:24, fontWeight:800, color:"#1a2a32", marginBottom:8 }}>言の葉</div>
        <div style={{ fontSize:13, color:"#7a9aaa" }}>読み込み中...</div>
      </div>
    </div>
  );

  if (!user) return <AuthScreen t={t}/>;

  // ── Bottom nav icons
  const NAV = [
    { key:"diary",    label:"日記",       icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { key:"calendar", label:"カレンダー", icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
    { key:"hiroba",   label:"広場",       icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="currentColor" strokeWidth="1.8"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
    { key:"stats",    label:"統計",       icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
    { key:"profile",  label:"プロフィール", icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  ];

  return (
    <div style={{ position:"fixed",top:`${vpTop}px`,left:0,right:0,height:`${vpHeight}px`,background:"#EAF1F4",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",overflow:"hidden" }}>
      <div style={{ width:"100%",maxWidth:660,display:"flex",flexDirection:"column",height:"100%" }}>

        {/* Page content */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          {tab==="diary" && DiaryTab}
          {tab==="calendar" && (
            <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
              <div style={{ padding:"14px 18px 12px",borderBottom:`1px solid ${t.color}14`,background:"#EAF1F4" }}>
                <div style={{ fontSize:19,fontWeight:800,color:"#1a2a32",letterSpacing:"-0.5px" }}>言の葉</div>
              </div>
              <div style={{ flex:1,overflowY:"auto" }}>
                <CalendarPage diaries={diaries} onSelectDate={selectDateFromCalendar} setDiaries={setDiaries} t={t}/>
              </div>
            </div>
          )}
          {tab==="stats" && (
            <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
              <div style={{ padding:"14px 18px 12px",borderBottom:`1px solid ${t.color}14`,background:"#EAF1F4" }}>
                <div style={{ fontSize:19,fontWeight:800,color:"#1a2a32",letterSpacing:"-0.5px" }}>言の葉</div>
              </div>
              <div style={{ flex:1,overflowY:"auto" }}>
                <StatsPage diaries={diaries} t={t}/>
              </div>
            </div>
          )}
          {tab==="hiroba" && (
            <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
              <HirobaPage diaries={diaries} t={t}/>
            </div>
          )}
          {tab==="profile" && (
            <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
              <div style={{ padding:"14px 18px 12px",borderBottom:`1px solid ${t.color}14`,background:"#EAF1F4" }}>
                <div style={{ fontSize:19,fontWeight:800,color:"#1a2a32",letterSpacing:"-0.5px" }}>言の葉</div>
              </div>
              <div style={{ flex:1,overflowY:"auto" }}>
                <ProfilePage diaries={diaries} t={t} user={user}/>
              </div>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div style={{
          display:"flex",background:"#EAF1F4",
          borderTop:"1px solid #ffffff08",
          paddingBottom:isKeyboardOpen?"0":"env(safe-area-inset-bottom,0px)",
          maxHeight:isKeyboardOpen?"0":"72px",overflow:"hidden",transition:"max-height 0.2s ease",flexShrink:0,
        }}>
          {NAV.map(nav=>(
            <button key={nav.key} onClick={()=>setTab(nav.key)} style={{
              flex:1,padding:"10px 0 8px",border:"none",background:"transparent",
              cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              color:tab===nav.key?t.accent:"#7a9aaa",transition:"color 0.3s cubic-bezier(0.4,0,0.2,1)",fontFamily:"inherit",
            }}>
              {nav.icon}
              <span style={{ fontSize:10,fontWeight:tab===nav.key?700:400 }}>{nav.label}</span>
              {tab===nav.key&&<div style={{ width:4,height:4,borderRadius:"50%",background:t.accent }}/>}
            </button>
          ))}
        </div>
      </div>

      {showSummary&&(
        <SummaryModal summary={summary} loading={summaryLoading} onClose={closeSummary} closing={summaryClosing} t={t} dateLabel={dayLabel(selected)}/>
      )}

      <style>{`
        @keyframes leafFall0 { 0%{transform:translateY(-60px) rotate(0deg);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(110vh) rotate(360deg);opacity:0} }
        @keyframes leafFall1 { 0%{transform:translateY(-60px) rotate(0deg);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(110vh) rotate(-360deg);opacity:0} }
        @keyframes leafFall2 { 0%{transform:translateY(-60px) translateX(0) rotate(0deg);opacity:0} 10%{opacity:1} 50%{transform:translateY(55vh) translateX(30px) rotate(180deg);opacity:1} 100%{transform:translateY(110vh) translateX(-20px) rotate(360deg);opacity:0} }
        @keyframes leafFall3 { 0%{transform:translateY(-60px) translateX(0) rotate(0deg);opacity:0} 10%{opacity:1} 50%{transform:translateY(55vh) translateX(-30px) rotate(-180deg);opacity:1} 100%{transform:translateY(110vh) translateX(20px) rotate(-360deg);opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(40px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes slideDown { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(30px) scale(0.97)} }
        @keyframes cropSlideUp { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes bookOpen { from{opacity:0;transform:perspective(800px) rotateY(-25deg) scale(0.88)} to{opacity:1;transform:perspective(800px) rotateY(0deg) scale(1)} }
        @keyframes bookClose { from{opacity:1;transform:perspective(800px) rotateY(0deg) scale(1)} to{opacity:0;transform:perspective(800px) rotateY(-25deg) scale(0.88)} }
        @keyframes pageFlip { from{transform:perspective(600px) rotateY(0deg);opacity:1} to{transform:perspective(600px) rotateY(-90deg);opacity:0} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        * { -webkit-font-smoothing:antialiased; }
        @keyframes bounce { 0%,80%,100%{transform:scale(0.5);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        textarea::placeholder{color:#252530}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#B8CED8;border-radius:2px}
        html,body{margin:0;padding:0;height:100%;overflow:hidden;}
      `}</style>
    </div>
  );
}
