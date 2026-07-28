import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Anchor, Plus, LogOut, Trash2, X, Calendar, Paperclip, Upload } from "lucide-react";

// ---- Supabase project (safe to expose in the browser — protected by Row Level Security) ----
const SUPABASE_URL = "https://zfmocglobusxdgnrgolc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_E977mudi_TyESqjLPBl4Jg_-dN5LYId";

function usernameToEmail(username) {
  return `${username.trim().toLowerCase().replace(/\s+/g, ".")}@team.local`;
}

async function supabaseSignIn(username, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: usernameToEmail(username), password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Incorrect username or password.");
  return data; // { access_token, refresh_token, user }
}

async function supabaseSignUp(username, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: usernameToEmail(username), password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Could not create this account.");
  if (!data.access_token) throw new Error("Account created, but sign-in confirmation is still required. Turn off 'Confirm email' in Supabase Auth settings.");
  return data;
}

async function supabaseInsertProfile(accessToken, profile) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(profile),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not save this member's profile.");
  return data;
}

async function supabaseFetchProfiles(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not load members.");
  return data;
}

async function supabaseDeleteProfile(accessToken, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Could not remove this member.");
  }
}

// ---- Design tokens (Alliance Shipping & Logistics) ----
const C = {
  navyDeep: "#0B1F3A",
  navyInk: "#122A4C",
  navyLine: "#2A4570",
  gold: "#B8933F",
  goldLight: "#D9BD7C",
  cream: "#F7F4EE",
  card: "#FFFFFF",
  border: "#E4DFD3",
  slate: "#5B6472",
  slateLight: "#8791A0",
  amber: "#B4652F",
  blue: "#2B5F8A",
  green: "#2F6B4F",
  red: "#B14343",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
`;

const STATUS = {
  not_started: { label: "Not Started", color: C.slate },
  in_progress: { label: "In Progress", color: C.blue },
  completed: { label: "Completed", color: C.green },
};

const CURRENCIES = {
  USD: { symbol: "$" },
  EUR: { symbol: "€" },
  TRY: { symbol: "₺" },
  AED: { symbol: "AED " },
  OMR: { symbol: "OMR " },
};

const DOC_TYPES = ["Invoice", "Contract", "Packing List", "Other"];

const SHIPMENT_STAGES = [
  { key: "bookingConfirmed", label: "Booking Confirmed" },
  { key: "loaded", label: "Loaded" },
  { key: "vesselDeparted", label: "Vessel Departed" },
  { key: "inTransit", label: "In Transit" },
  { key: "arrived", label: "Arrived" },
];

function currentStageLabel(stages) {
  if (!stages) return null;
  let last = null;
  for (const s of SHIPMENT_STAGES) {
    if (stages[s.key]) last = s.label;
  }
  return last;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(amount, currency) {
  const symbol = CURRENCIES[currency]?.symbol || "";
  return `${symbol}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function sumByCurrency(items) {
  const totals = {};
  items.forEach((item) => {
    totals[item.currency] = (totals[item.currency] || 0) + Number(item.amount || 0);
  });
  return totals;
}

function useExchangeRates() {
  const [rates, setRates] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data && data.rates) {
          setRates(data.rates);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rates, status };
}

function toUSD(amount, currency, rates) {
  if (currency === "USD") return amount;
  const rate = rates?.[currency]; // units of `currency` per 1 USD
  if (!rate) return null;
  return amount / rate;
}

// ---- Demo data ----
const initialTasks = [
  {
    id: 1,
    title: "Container #TRK-2291 — Izmir Port Customs Clearance",
    status: "in_progress",
    updates: [
      { id: 101, author: "Elif Kaya", date: todayISO(), text: "Customs documents submitted, awaiting approval." },
      { id: 102, author: "Deniz Aksoy", date: todayISO(), text: "Container arrived at port." },
    ],
  },
  {
    id: 2,
    title: "New Client Quote — Ege Textile Exports",
    status: "not_started",
    updates: [
      { id: 201, author: "Can Yildiz", date: todayISO(), text: "Gathering pricing info before preparing the quote." },
    ],
  },
  {
    id: 3,
    title: "Fleet Vehicle Maintenance — 34 ABC 123",
    status: "completed",
    updates: [
      { id: 301, author: "Burak Sahin", date: todayISO(), text: "Maintenance completed, vehicle back on the road." },
    ],
  },
];

const initialQuotes = [
  {
    id: 1,
    quoteNumber: "Q-0001",
    date: todayISO(),
    client: "Anadolu Steel Co.",
    title: "Bulk Steel Coil Shipment — Mersin to Hamburg",
    description: "Quoted for 3x 40ft containers, FOB Mersin.",
    costItems: [{ id: 5001, description: "Freight", amount: 2800, currency: "USD" }],
    revenueItems: [{ id: 6001, description: "Client Quote", amount: 3600, currency: "USD" }],
    convertedOperationId: null,
  },
];

const initialMembers = [
  { id: 1, name: "Deniz Aksoy", username: "deniz.aksoy", role: "Operations" },
  { id: 2, name: "Elif Kaya", username: "elif.kaya", role: "Customs & Documentation" },
  { id: 3, name: "Can Yildiz", username: "can.yildiz", role: "Sales" },
];

function nextQuoteNumber(quotes) {
  const n = quotes.length + 1;
  return `Q-${String(n).padStart(4, "0")}`;
}

const initialOperations = [
  {
    id: 1,
    title: "Izmir → Rotterdam Container Shipment",
    client: "Ege Textile Exports",
    description: "20ft container, textile goods. Client requested priority handling at customs.",
    stages: { bookingConfirmed: true, loaded: true, vesselDeparted: true, inTransit: false, arrived: false },
    costItems: [
      { id: 1001, description: "Freight", amount: 3200, currency: "USD" },
      { id: 1002, description: "Customs Clearance", amount: 8500, currency: "TRY" },
    ],
    revenueItems: [{ id: 2001, description: "Client Invoice", amount: 4500, currency: "USD" }],
    documents: [{ id: 3001, type: "Invoice", name: "invoice-2291.pdf" }],
    closed: false,
  },
];

function Wordmark({ size = "md" }) {
  const big = size === "lg";
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          letterSpacing: big ? "0.2em" : "0.14em",
          fontSize: big ? 42 : 21,
          color: C.cream,
        }}
      >
        ALLIANCE
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: big ? "10px 0 8px" : "4px 0 2px" }}>
        <span style={{ height: 1, width: big ? 56 : 26, background: C.gold, opacity: 0.7 }} />
        <span style={{ width: 5, height: 5, background: C.gold, transform: "rotate(45deg)" }} />
        <span style={{ height: 1, width: big ? 56 : 26, background: C.gold, opacity: 0.7 }} />
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.2em", fontSize: big ? 13 : 10, color: C.goldLight }}>
        SHIPPING &amp; LOGISTICS LLC
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter a username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await supabaseSignIn(username, password);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.navyDeep,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{FONTS}</style>
      <Anchor size={32} color={C.gold} strokeWidth={1.6} style={{ marginBottom: 16 }} />
      <Wordmark size="lg" />

      <form
        onSubmit={handleSubmit}
        style={{
          marginTop: 44,
          width: "100%",
          maxWidth: 380,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.navyLine}`,
          borderRadius: 6,
          padding: 30,
        }}
      >
        <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.slateLight, marginBottom: 8 }}>
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. elif.kaya"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = C.gold)}
          onBlur={(e) => (e.target.style.borderColor = C.navyLine)}
        />

        <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.slateLight, margin: "18px 0 8px" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = C.gold)}
          onBlur={(e) => (e.target.style.borderColor = C.navyLine)}
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 18,
            fontSize: 14.5,
            color: C.slateLight,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            style={{ width: 17, height: 17, cursor: "pointer", accentColor: C.gold }}
          />
          Remember me
        </label>

        {error && <div style={{ color: "#E39A6B", fontSize: 14, marginTop: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 24,
            padding: "13px 0",
            background: C.gold,
            color: C.navyDeep,
            fontWeight: 700,
            fontSize: 16,
            border: "none",
            borderRadius: 4,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <div style={{ marginTop: 18, fontSize: 13, color: C.slateLight, textAlign: "center", lineHeight: 1.5 }}>
          Connected to your real Alliance account system.
          <br />
          In this preview, "Remember me" won't persist across a page refresh — that will work normally once the site is live on its own domain.
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.02)",
  border: `1px solid ${C.navyLine}`,
  borderRadius: 4,
  color: C.cream,
  fontSize: 16,
  fontFamily: "'Inter', sans-serif",
};

function StatusPill({ statusKey, onClick, active }) {
  const s = STATUS[statusKey];
  const clickable = !!onClick;
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 14,
        fontWeight: 600,
        color: active === false ? C.slate : s.color,
        background: active === false ? "transparent" : `${s.color}16`,
        border: `1.5px solid ${active === false ? C.border : s.color}`,
        borderRadius: 20,
        padding: "6px 14px",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: active === false ? C.border : s.color }} />
      {s.label}
    </span>
  );
}

function IconButton({ onClick, children, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 6,
        borderRadius: 4,
        color: danger ? C.red : C.slateLight,
        display: "flex",
        alignItems: "center",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "#B1434312" : "#00000008")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      {children}
    </button>
  );
}

/* ===================== ACTIVE TASKS ===================== */

function TaskCard({ task, onOpen, onDelete }) {
  const lastUpdate = task.updates[0];
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        marginBottom: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div onClick={() => onOpen(task)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.navyDeep, marginBottom: 8 }}>{task.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: lastUpdate ? 8 : 0 }}>
          <StatusPill statusKey={task.status} />
        </div>
        {lastUpdate && (
          <div style={{ fontSize: 14.5, color: C.slate, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: C.navyInk }}>{lastUpdate.author}</span>
            <span style={{ color: C.slateLight }}> · {formatDate(lastUpdate.date)}: </span>
            {lastUpdate.text}
          </div>
        )}
      </div>
      <IconButton title="Delete task" danger onClick={() => onDelete(task.id)}>
        <Trash2 size={19} />
      </IconButton>
    </div>
  );
}

function TaskModal({ task, onClose, onSave, onDelete, currentUser }) {
  const isNew = !task;
  const [title, setTitle] = useState(task?.title || "");
  const [status, setStatus] = useState(task?.status || "not_started");
  const [updates, setUpdates] = useState(task?.updates || []);
  const [newDate, setNewDate] = useState(todayISO());
  const [newText, setNewText] = useState("");

  function addUpdate() {
    if (!newText.trim()) return;
    setUpdates([{ id: Date.now(), author: currentUser, date: newDate, text: newText.trim() }, ...updates]);
    setNewText("");
    setNewDate(todayISO());
  }

  function removeUpdate(id) {
    setUpdates(updates.filter((u) => u.id !== id));
  }

  function save() {
    if (!title.trim()) return;
    onSave({ id: task?.id || Date.now(), title: title.trim(), status, updates });
    onClose();
  }

  return (
    <ModalShell onClose={onClose} title={isNew ? "New Active Task" : "Task Details"} onDelete={!isNew ? () => { onDelete(task.id); onClose(); } : null}>
      <label style={labelStyle}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Antalya Port Cargo Delivery" style={lightInputStyle} autoFocus />

      <label style={{ ...labelStyle, marginTop: 18 }}>Status</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        {Object.keys(STATUS).map((key) => (
          <StatusPill key={key} statusKey={key} active={key === status} onClick={() => setStatus(key)} />
        ))}
      </div>

      <label style={{ ...labelStyle, marginTop: 24 }}>Updates</label>
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        {updates.length === 0 && <div style={{ fontSize: 14, color: C.slateLight, padding: "8px 0" }}>No updates yet.</div>}
        {updates.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13.5, color: C.slateLight, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: C.navyInk }}>{u.author}</span> · {formatDate(u.date)}
              </div>
              <div style={{ fontSize: 15, color: "#333", lineHeight: 1.5 }}>{u.text}</div>
            </div>
            <IconButton title="Delete update" danger onClick={() => removeUpdate(u.id)}>
              <Trash2 size={17} />
            </IconButton>
          </div>
        ))}
      </div>

      <div style={{ background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.slate, marginBottom: 10 }}>Add an update</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Calendar size={16} color={C.slateLight} />
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ ...lightInputStyle, width: "auto", padding: "8px 10px", fontSize: 14 }} />
        </div>
        <textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={`Write an update as ${currentUser}...`} rows={3} style={{ ...lightInputStyle, resize: "vertical", fontSize: 15 }} />
        <button onClick={addUpdate} style={smallDarkButton}>Add Update</button>
      </div>

      <button onClick={save} style={primaryButton}>{isNew ? "Create Task" : "Save Changes"}</button>
    </ModalShell>
  );
}

/* ===================== OPERATIONS ===================== */

function currencyChipsRow(items) {
  const totals = sumByCurrency(items);
  return Object.entries(totals);
}

function OperationCard({ op, onOpen, onDelete }) {
  const costTotals = sumByCurrency(op.costItems);
  const revenueTotals = sumByCurrency(op.revenueItems);
  const currencies = Array.from(new Set([...Object.keys(costTotals), ...Object.keys(revenueTotals)]));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div onClick={() => onOpen(op)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.navyDeep, marginBottom: 4 }}>{op.title}</div>
        <div style={{ fontSize: 14, color: C.slateLight, marginBottom: 10 }}>
          {op.client}
          {op.closed && (
            <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: C.green, background: `${C.green}14`, padding: "3px 10px", borderRadius: 20 }}>
              Closed
            </span>
          )}
          {!op.closed && currentStageLabel(op.stages) && (
            <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: C.blue, background: `${C.blue}14`, padding: "3px 10px", borderRadius: 20 }}>
              {currentStageLabel(op.stages)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {currencies.length === 0 && <span style={{ fontSize: 14, color: C.slateLight }}>No amounts entered yet.</span>}
          {currencies.map((cur) => {
            const profit = (revenueTotals[cur] || 0) - (costTotals[cur] || 0);
            const positive = profit >= 0;
            return (
              <span
                key={cur}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "5px 12px",
                  borderRadius: 20,
                  color: positive ? C.green : C.red,
                  background: positive ? `${C.green}14` : `${C.red}14`,
                  border: `1px solid ${positive ? C.green : C.red}40`,
                }}
              >
                {positive ? "+" : ""}
                {formatMoney(profit, cur)}
              </span>
            );
          })}
          {op.documents.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13.5, color: C.slateLight }}>
              <Paperclip size={13} /> {op.documents.length} document{op.documents.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <IconButton title="Delete operation" danger onClick={() => onDelete(op.id)}>
        <Trash2 size={19} />
      </IconButton>
    </div>
  );
}

function LineItemsEditor({ label, items, setItems, positiveColor }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  function add() {
    if (!desc.trim() || !amount || Number(amount) <= 0) return;
    setItems([...items, { id: Date.now(), description: desc.trim(), amount: Number(amount), currency }]);
    setDesc("");
    setAmount("");
  }

  function remove(id) {
    setItems(items.filter((i) => i.id !== id));
  }

  const totals = sumByCurrency(items);

  return (
    <div>
      <label style={{ ...labelStyle, marginTop: 24 }}>{label}</label>

      {items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {items.map((i) => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 15, color: "#333" }}>{i.description}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.navyDeep }}>{formatMoney(i.amount, i.currency)}</span>
                <IconButton title="Delete line" danger onClick={() => remove(i.id)}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(totals).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.entries(totals).map(([cur, total]) => (
            <span key={cur} style={{ fontSize: 13, fontWeight: 700, color: positiveColor, background: `${positiveColor}14`, padding: "4px 10px", borderRadius: 20 }}>
              Total {formatMoney(total, cur)}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (e.g. Freight)" style={{ ...lightInputStyle, flex: "2 1 160px" }} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" type="number" style={{ ...lightInputStyle, flex: "1 1 100px" }} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...lightInputStyle, flex: "0 0 90px" }}>
          {Object.keys(CURRENCIES).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button onClick={add} style={{ ...smallDarkButton, marginTop: 0, flex: "0 0 auto" }}>
          Add
        </button>
      </div>
    </div>
  );
}

function DocumentsEditor({ documents, setDocuments }) {
  const [docType, setDocType] = useState(DOC_TYPES[0]);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocuments([...documents, { id: Date.now(), type: docType, name: file.name }]);
    e.target.value = "";
  }

  function remove(id) {
    setDocuments(documents.filter((d) => d.id !== id));
  }

  return (
    <div>
      <label style={{ ...labelStyle, marginTop: 24 }}>Documents</label>

      {documents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {documents.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Paperclip size={15} color={C.slateLight} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, textTransform: "uppercase" }}>{d.type}</span>
                <span style={{ fontSize: 14.5, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              </div>
              <IconButton title="Delete document" danger onClick={() => remove(d.id)}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...lightInputStyle, flex: "0 0 150px" }}>
          {DOC_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label style={{ ...smallDarkButton, marginTop: 0, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Upload size={15} /> Upload File
          <input type="file" onChange={handleFile} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ fontSize: 12.5, color: C.slateLight, marginTop: 8 }}>
        File storage will be fully connected once the real backend is set up. For now the file name is saved.
      </div>
    </div>
  );
}

function emptyStages() {
  const s = {};
  SHIPMENT_STAGES.forEach((st) => (s[st.key] = false));
  return s;
}

function ShipmentStatusEditor({ stages, setStages }) {
  const completedCount = SHIPMENT_STAGES.filter((s) => stages[s.key]).length;
  const pct = Math.round((completedCount / SHIPMENT_STAGES.length) * 100);

  return (
    <div>
      <label style={{ ...labelStyle, marginTop: 24 }}>Shipment Status</label>

      <div style={{ height: 6, background: C.border, borderRadius: 4, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.gold, borderRadius: 4, transition: "width 0.2s" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {SHIPMENT_STAGES.map((s) => (
          <label
            key={s.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 4px",
              cursor: "pointer",
              fontSize: 15.5,
              color: stages[s.key] ? C.navyDeep : C.slate,
              fontWeight: stages[s.key] ? 700 : 500,
            }}
          >
            <input
              type="checkbox"
              checked={!!stages[s.key]}
              onChange={(e) => setStages({ ...stages, [s.key]: e.target.checked })}
              style={{ width: 19, height: 19, cursor: "pointer", accentColor: C.gold }}
            />
            {s.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function FinancialSummary({ costItems, revenueItems, rates, status }) {
  const costTotals = sumByCurrency(costItems);
  const revenueTotals = sumByCurrency(revenueItems);
  const currencies = Array.from(new Set([...Object.keys(costTotals), ...Object.keys(revenueTotals)]));

  if (currencies.length === 0) return null;

  // Combined totals converted to USD using live rates
  let usdCost = 0;
  let usdRevenue = 0;
  let conversionIncomplete = false;
  currencies.forEach((cur) => {
    const c = toUSD(costTotals[cur] || 0, cur, rates);
    const r = toUSD(revenueTotals[cur] || 0, cur, rates);
    if (c === null || r === null) conversionIncomplete = true;
    usdCost += c || 0;
    usdRevenue += r || 0;
  });
  const usdProfit = usdRevenue - usdCost;
  const usdMargin = usdRevenue > 0 ? (usdProfit / usdRevenue) * 100 : null;

  return (
    <div>
      <label style={{ ...labelStyle, marginTop: 24 }}>Financial Summary</label>
      <div style={{ background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
        {currencies.map((cur) => {
          const cost = costTotals[cur] || 0;
          const revenue = revenueTotals[cur] || 0;
          const profit = revenue - cost;
          const margin = revenue > 0 ? (profit / revenue) * 100 : null;
          const positive = profit >= 0;
          return (
            <div key={cur} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.slate }}>{cur}</span>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, color: C.slateLight }}>Cost {formatMoney(cost, cur)}</span>
                <span style={{ fontSize: 13.5, color: C.slateLight }}>Revenue {formatMoney(revenue, cur)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: positive ? C.green : C.red }}>
                  Profit {positive ? "+" : ""}
                  {formatMoney(profit, cur)}
                  {margin !== null && ` (${margin.toFixed(1)}%)`}
                </span>
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1.5px solid ${C.navyDeep}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gold, textTransform: "uppercase", marginBottom: 8 }}>
            Combined Total (converted to USD)
          </div>
          {status === "loading" && <div style={{ fontSize: 13.5, color: C.slateLight }}>Fetching live exchange rates...</div>}
          {status === "error" && <div style={{ fontSize: 13.5, color: C.red }}>Live rates unavailable right now — showing amounts above only.</div>}
          {status === "ready" && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: C.slateLight }}>Cost {formatMoney(usdCost, "USD")}</span>
              <span style={{ fontSize: 13.5, color: C.slateLight }}>Revenue {formatMoney(usdRevenue, "USD")}</span>
              <span style={{ fontSize: 16.5, fontWeight: 700, color: usdProfit >= 0 ? C.green : C.red }}>
                Profit {usdProfit >= 0 ? "+" : ""}
                {formatMoney(usdProfit, "USD")}
                {usdMargin !== null && ` (${usdMargin.toFixed(1)}%)`}
              </span>
            </div>
          )}
          {status === "ready" && (
            <div style={{ fontSize: 11.5, color: C.slateLight, marginTop: 8 }}>
              Rates update live each time this screen loads.{conversionIncomplete ? " Some currencies could not be converted." : ""}
            </div>
          )}

          {status === "ready" && usdRevenue > 0 && usdProfit >= 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.slate, marginBottom: 4 }}>Cost vs. Profit (of Revenue)</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Cost", value: usdCost },
                        { name: "Profit", value: usdProfit },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      <Cell fill={C.red} />
                      <Cell fill={C.green} />
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value, "USD")} />
                    <Legend verticalAlign="bottom" height={28} formatter={(value) => <span style={{ fontSize: 13, color: C.slate }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {status === "ready" && usdRevenue > 0 && usdProfit < 0 && (
            <div style={{ fontSize: 13, color: C.red, marginTop: 14 }}>
              This operation is currently running at a loss, so no cost/profit split is shown.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OperationModal({ op, onClose, onSave, onDelete, onCloseOperation, rates, ratesStatus }) {
  const isNew = !op;
  const [title, setTitle] = useState(op?.title || "");
  const [client, setClient] = useState(op?.client || "");
  const [description, setDescription] = useState(op?.description || "");
  const [stages, setStages] = useState(op?.stages || emptyStages());
  const [costItems, setCostItems] = useState(op?.costItems || []);
  const [revenueItems, setRevenueItems] = useState(op?.revenueItems || []);
  const [documents, setDocuments] = useState(op?.documents || []);

  function buildData() {
    return {
      id: op?.id || Date.now(),
      title: title.trim(),
      client: client.trim(),
      description: description.trim(),
      stages,
      costItems,
      revenueItems,
      documents,
      closed: op?.closed || false,
    };
  }

  function save() {
    if (!title.trim()) return;
    onSave(buildData());
    onClose();
  }

  function closeOperation() {
    if (!title.trim()) return;
    onCloseOperation(buildData());
    onClose();
  }

  return (
    <ModalShell onClose={onClose} title={isNew ? "New Operation" : "Operation Details"} onDelete={!isNew ? () => { onDelete(op.id); onClose(); } : null}>
      <label style={labelStyle}>Operation Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Izmir → Rotterdam Container Shipment" style={lightInputStyle} autoFocus />

      <label style={{ ...labelStyle, marginTop: 18 }}>Client</label>
      <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Ege Textile Exports" style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Description / Comments</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add any details, notes, or context about this operation..."
        rows={4}
        style={{ ...lightInputStyle, resize: "vertical", fontSize: 15.5, lineHeight: 1.5 }}
      />

      <ShipmentStatusEditor stages={stages} setStages={setStages} />

      <LineItemsEditor label="Cost (Buy Side)" items={costItems} setItems={setCostItems} positiveColor={C.red} />
      <LineItemsEditor label="Revenue (Sell Side)" items={revenueItems} setItems={setRevenueItems} positiveColor={C.green} />
      <FinancialSummary costItems={costItems} revenueItems={revenueItems} rates={rates} status={ratesStatus} />
      <DocumentsEditor documents={documents} setDocuments={setDocuments} />

      <button onClick={save} style={primaryButton}>{isNew ? "Create Operation" : "Save Changes"}</button>

      {!isNew && (
        op.closed ? (
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 13.5, color: C.green, fontWeight: 700 }}>
            ✓ Closed — sent to Finance
          </div>
        ) : (
          <button
            onClick={closeOperation}
            disabled={ratesStatus !== "ready"}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "13px 0",
              background: "transparent",
              color: C.navyDeep,
              fontWeight: 700,
              fontSize: 15,
              border: `1.5px solid ${C.navyDeep}`,
              borderRadius: 5,
              cursor: ratesStatus === "ready" ? "pointer" : "default",
              opacity: ratesStatus === "ready" ? 1 : 0.5,
            }}
          >
            {ratesStatus === "ready" ? "Close Operation → Send to Finance" : "Waiting for exchange rates..."}
          </button>
        )
      )}
    </ModalShell>
  );
}

/* ===================== QUOTES ===================== */

function QuoteCard({ quote, onOpen, onDelete }) {
  const costTotals = sumByCurrency(quote.costItems);
  const revenueTotals = sumByCurrency(quote.revenueItems);
  const currencies = Array.from(new Set([...Object.keys(costTotals), ...Object.keys(revenueTotals)]));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div onClick={() => onOpen(quote)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: "0.03em" }}>{quote.quoteNumber}</span>
          <span style={{ fontSize: 13, color: C.slateLight }}>{formatDate(quote.date)}</span>
          {quote.convertedOperationId && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green, background: `${C.green}14`, padding: "3px 10px", borderRadius: 20 }}>
              Converted to Operation
            </span>
          )}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.navyDeep, marginBottom: 4 }}>{quote.title}</div>
        <div style={{ fontSize: 14, color: C.slateLight, marginBottom: 10 }}>{quote.client}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {currencies.length === 0 && <span style={{ fontSize: 14, color: C.slateLight }}>No amounts entered yet.</span>}
          {currencies.map((cur) => {
            const profit = (revenueTotals[cur] || 0) - (costTotals[cur] || 0);
            const revenue = revenueTotals[cur] || 0;
            const margin = revenue > 0 ? (profit / revenue) * 100 : null;
            const positive = profit >= 0;
            return (
              <span
                key={cur}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "5px 12px",
                  borderRadius: 20,
                  color: positive ? C.green : C.red,
                  background: positive ? `${C.green}14` : `${C.red}14`,
                  border: `1px solid ${positive ? C.green : C.red}40`,
                }}
              >
                {positive ? "+" : ""}
                {formatMoney(profit, cur)}
                {margin !== null && ` (${margin.toFixed(1)}%)`}
              </span>
            );
          })}
        </div>
      </div>
      <IconButton title="Delete quote" danger onClick={() => onDelete(quote.id)}>
        <Trash2 size={19} />
      </IconButton>
    </div>
  );
}

function QuoteModal({ quote, onClose, onSave, onDelete, onConvert, nextNumber, rates, ratesStatus }) {
  const isNew = !quote;
  const [quoteNumber, setQuoteNumber] = useState(quote?.quoteNumber || nextNumber);
  const [date, setDate] = useState(quote?.date || todayISO());
  const [client, setClient] = useState(quote?.client || "");
  const [title, setTitle] = useState(quote?.title || "");
  const [description, setDescription] = useState(quote?.description || "");
  const [costItems, setCostItems] = useState(quote?.costItems || []);
  const [revenueItems, setRevenueItems] = useState(quote?.revenueItems || []);

  function buildData() {
    return {
      id: quote?.id || Date.now(),
      quoteNumber: quoteNumber.trim() || nextNumber,
      date,
      client: client.trim(),
      title: title.trim(),
      description: description.trim(),
      costItems,
      revenueItems,
      convertedOperationId: quote?.convertedOperationId || null,
    };
  }

  function save() {
    if (!title.trim()) return;
    onSave(buildData());
    onClose();
  }

  function convert() {
    if (!title.trim()) return;
    onConvert(buildData());
    onClose();
  }

  return (
    <ModalShell onClose={onClose} title={isNew ? "New Quotation" : "Quotation Details"} onDelete={!isNew ? () => { onDelete(quote.id); onClose(); } : null}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Quotation Number</label>
          <input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} style={lightInputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={lightInputStyle} />
        </div>
      </div>

      <label style={{ ...labelStyle, marginTop: 18 }}>Client</label>
      <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Anadolu Steel Co." style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bulk Steel Coil Shipment — Mersin to Hamburg" style={lightInputStyle} autoFocus />

      <label style={{ ...labelStyle, marginTop: 18 }}>Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Scope, terms, or notes about this quote..."
        rows={4}
        style={{ ...lightInputStyle, resize: "vertical", fontSize: 15.5, lineHeight: 1.5 }}
      />

      <LineItemsEditor label="Cost (Buy Side)" items={costItems} setItems={setCostItems} positiveColor={C.red} />
      <LineItemsEditor label="Revenue (Sell Side / Quoted Price)" items={revenueItems} setItems={setRevenueItems} positiveColor={C.green} />
      <FinancialSummary costItems={costItems} revenueItems={revenueItems} rates={rates} status={ratesStatus} />

      <button onClick={save} style={primaryButton}>{isNew ? "Save Quotation" : "Save Changes"}</button>

      {quote?.convertedOperationId ? (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13.5, color: C.green, fontWeight: 700 }}>
          ✓ Already converted to an operation
        </div>
      ) : (
        <button
          onClick={convert}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "13px 0",
            background: "transparent",
            color: C.navyDeep,
            fontWeight: 700,
            fontSize: 15,
            border: `1.5px solid ${C.navyDeep}`,
            borderRadius: 5,
            cursor: "pointer",
          }}
        >
          Mark as Accepted → Convert to Operation
        </button>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, onClose, onDelete, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(11,31,58,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto", zIndex: 50 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 8, width: "100%", maxWidth: 560, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: C.navyDeep }}>{title}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {onDelete && (
              <IconButton title="Delete" danger onClick={onDelete}>
                <Trash2 size={19} />
              </IconButton>
            )}
            <IconButton title="Close" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13.5, letterSpacing: "0.04em", color: C.slate, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" };
const lightInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  fontSize: 16,
  fontFamily: "'Inter', sans-serif",
  color: C.navyDeep,
};
const smallDarkButton = {
  marginTop: 10,
  padding: "10px 18px",
  background: C.navyDeep,
  color: C.cream,
  border: "none",
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const primaryButton = {
  width: "100%",
  marginTop: 26,
  padding: "13px 0",
  background: C.gold,
  color: C.navyDeep,
  fontWeight: 700,
  fontSize: 16,
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
};

/* ===================== DASHBOARD / NAV ===================== */

const NAV_ITEMS = [
  { key: "tasks", label: "Active Tasks", ready: true },
  { key: "operations", label: "Operations", ready: true },
  { key: "quotes", label: "Quotations", ready: true },
  { key: "finance", label: "Finance", ready: true },
  { key: "members", label: "Members", ready: true },
];

function TasksPanel({ currentUser }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("all");
  const [modalTask, setModalTask] = useState(undefined);

  function saveTask(taskData) {
    setTasks((prev) => (prev.some((t) => t.id === taskData.id) ? prev.map((t) => (t.id === taskData.id ? taskData : t)) : [taskData, ...prev]));
  }
  function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const visibleTasks = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <>
      <PanelHeader title="Active Tasks" buttonLabel="New Active Task" onAdd={() => setModalTask(null)} />
      <FilterRow filter={filter} setFilter={setFilter} />
      {visibleTasks.length === 0 ? (
        <EmptyState text="No tasks in this status." />
      ) : (
        visibleTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setModalTask} onDelete={deleteTask} />)
      )}
      {modalTask !== undefined && (
        <TaskModal task={modalTask} onClose={() => setModalTask(undefined)} onSave={saveTask} onDelete={deleteTask} currentUser={currentUser} />
      )}
    </>
  );
}

function OperationsPanel({ operations, setOperations, onCloseOperation, rates, ratesStatus }) {
  const [modalOp, setModalOp] = useState(undefined);

  function saveOp(opData) {
    setOperations((prev) => (prev.some((o) => o.id === opData.id) ? prev.map((o) => (o.id === opData.id ? opData : o)) : [opData, ...prev]));
  }
  function deleteOp(id) {
    setOperations((prev) => prev.filter((o) => o.id !== id));
  }
  function closeOp(opData) {
    onCloseOperation(opData);
  }

  return (
    <>
      <PanelHeader title="Operations" buttonLabel="New Operation" onAdd={() => setModalOp(null)} />
      {operations.length === 0 ? (
        <EmptyState text="No operations yet." />
      ) : (
        operations.map((op) => <OperationCard key={op.id} op={op} onOpen={setModalOp} onDelete={deleteOp} />)
      )}
      {modalOp !== undefined && (
        <OperationModal
          op={modalOp}
          onClose={() => setModalOp(undefined)}
          onSave={saveOp}
          onDelete={deleteOp}
          onCloseOperation={closeOp}
          rates={rates}
          ratesStatus={ratesStatus}
        />
      )}
    </>
  );
}

function QuotesPanel({ onConvertToOperation, rates, ratesStatus }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [modalQuote, setModalQuote] = useState(undefined);

  function saveQuote(quoteData) {
    setQuotes((prev) => (prev.some((q) => q.id === quoteData.id) ? prev.map((q) => (q.id === quoteData.id ? quoteData : q)) : [quoteData, ...prev]));
  }
  function deleteQuote(id) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }
  function convertQuote(quoteData) {
    const operationId = onConvertToOperation(quoteData);
    const updated = { ...quoteData, convertedOperationId: operationId };
    saveQuote(updated);
  }

  return (
    <>
      <PanelHeader title="Quotations" buttonLabel="New Quotation" onAdd={() => setModalQuote(null)} />
      {quotes.length === 0 ? (
        <EmptyState text="No quotations yet." />
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} quote={q} onOpen={setModalQuote} onDelete={deleteQuote} />)
      )}
      {modalQuote !== undefined && (
        <QuoteModal
          quote={modalQuote}
          nextNumber={nextQuoteNumber(quotes)}
          onClose={() => setModalQuote(undefined)}
          onSave={saveQuote}
          onDelete={deleteQuote}
          onConvert={convertQuote}
          rates={rates}
          ratesStatus={ratesStatus}
        />
      )}
    </>
  );
}

const EXPENSE_CATEGORY_SUGGESTIONS = ["Office Rent", "Salaries", "Utilities", "Fuel", "Insurance", "Software & Subscriptions", "Marketing", "Bank Fees", "Other Expense"];
const INCOME_CATEGORY_SUGGESTIONS = ["Operation Revenue", "Consulting Fee", "Other Income"];

function AddActivityModal({ onClose, onSave, rates, ratesStatus }) {
  const [type, setType] = useState("expense");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  const canSave = category.trim() && amount && Number(amount) > 0 && ratesStatus === "ready";

  function save() {
    if (!canSave) return;
    const usdAmount = toUSD(Number(amount), currency, rates);
    onSave({
      id: Date.now(),
      type,
      date,
      category: category.trim(),
      client: client.trim(),
      description: description.trim(),
      amount: Number(amount),
      currency,
      usdAmount,
      source: "manual",
      operationId: null,
    });
    onClose();
  }

  return (
    <ModalShell onClose={onClose} title="Add Activity">
      <label style={labelStyle}>Type</label>
      <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
        {[{ key: "expense", label: "Expense", color: C.red }, { key: "income", label: "Income", color: C.green }].map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 14.5,
              fontWeight: 700,
              borderRadius: 5,
              cursor: "pointer",
              border: `1.5px solid ${type === t.key ? t.color : C.border}`,
              background: type === t.key ? `${t.color}14` : "transparent",
              color: type === t.key ? t.color : C.slate,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={lightInputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Category</label>
          <input
            list="category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Office Rent"
            style={lightInputStyle}
          />
          <datalist id="category-suggestions">
            {(type === "expense" ? EXPENSE_CATEGORY_SUGGESTIONS : INCOME_CATEGORY_SUGGESTIONS).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <label style={{ ...labelStyle, marginTop: 18 }}>Client (optional)</label>
      <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Leave blank for general company expenses" style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Description (optional)</label>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any extra detail..." style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Amount</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="0.00" style={{ ...lightInputStyle, flex: 2 }} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...lightInputStyle, flex: 1 }}>
          {Object.keys(CURRENCIES).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {ratesStatus !== "ready" && (
        <div style={{ fontSize: 13, color: C.slateLight, marginTop: 12 }}>
          {ratesStatus === "loading" ? "Fetching the exchange rate to lock in with this entry..." : "Live exchange rates are unavailable right now, so this entry can't be saved yet."}
        </div>
      )}
      {ratesStatus === "ready" && amount && Number(amount) > 0 && (
        <div style={{ fontSize: 13, color: C.slateLight, marginTop: 12 }}>
          Locked at today's rate: {formatMoney(toUSD(Number(amount), currency, rates) || 0, "USD")} — this won't change later even if rates move.
        </div>
      )}

      <button onClick={save} disabled={!canSave} style={{ ...primaryButton, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}>
        Save Activity
      </button>
    </ModalShell>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "18px 20px", flex: "1 1 180px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || C.navyDeep }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.slateLight, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const ALL_FILTER = "__all__";

function FinancePanel({ activities, setActivities, rates, ratesStatus }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fType, setFType] = useState(ALL_FILTER);
  const [fClient, setFClient] = useState(ALL_FILTER);
  const [fCategory, setFCategory] = useState(ALL_FILTER);
  const [fSource, setFSource] = useState(ALL_FILTER);

  function addActivity(activity) {
    setActivities((prev) => [activity, ...prev]);
  }
  function deleteActivity(id) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  // ---- Overview: all-time totals from locked USD amounts (stable, never recalculated) ----
  const totalIncome = activities.filter((a) => a.type === "income").reduce((sum, a) => sum + (a.usdAmount || 0), 0);
  const totalExpense = activities.filter((a) => a.type === "expense").reduce((sum, a) => sum + (a.usdAmount || 0), 0);
  const netProfit = totalIncome - totalExpense;
  const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : null;

  // ---- Profit by client (only entries with a client tag) ----
  const clientMap = {};
  activities.forEach((a) => {
    if (!a.client) return;
    if (!clientMap[a.client]) clientMap[a.client] = { income: 0, expense: 0 };
    if (a.type === "income") clientMap[a.client].income += a.usdAmount || 0;
    else clientMap[a.client].expense += a.usdAmount || 0;
  });
  const clientRows = Object.entries(clientMap)
    .map(([client, d]) => ({ client, ...d, net: d.income - d.expense }))
    .sort((a, b) => b.net - a.net);

  // ---- Filter option lists ----
  const clientOptions = Array.from(new Set(activities.map((a) => a.client).filter(Boolean)));
  const categoryOptions = Array.from(new Set(activities.map((a) => a.category).filter(Boolean)));

  // ---- Filtered report ----
  const filtered = activities.filter((a) => {
    if (fDateFrom && a.date < fDateFrom) return false;
    if (fDateTo && a.date > fDateTo) return false;
    if (fType !== ALL_FILTER && a.type !== fType) return false;
    if (fClient !== ALL_FILTER && a.client !== fClient) return false;
    if (fCategory !== ALL_FILTER && a.category !== fCategory) return false;
    if (fSource !== ALL_FILTER && a.source !== fSource) return false;
    return true;
  });
  const filteredIncome = filtered.filter((a) => a.type === "income").reduce((s, a) => s + (a.usdAmount || 0), 0);
  const filteredExpense = filtered.filter((a) => a.type === "expense").reduce((s, a) => s + (a.usdAmount || 0), 0);

  function resetFilters() {
    setFDateFrom("");
    setFDateTo("");
    setFType(ALL_FILTER);
    setFClient(ALL_FILTER);
    setFCategory(ALL_FILTER);
    setFSource(ALL_FILTER);
  }

  const filterSelectStyle = { ...lightInputStyle, fontSize: 14, padding: "9px 10px" };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 26 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700, color: C.navyDeep, margin: 0 }}>Finance</h1>
          <p style={{ fontSize: 14.5, color: C.slateLight, marginTop: 6 }}>
            Every entry locks in the USD value at the moment it's added — totals below won't shift as rates move.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: C.gold, color: C.navyDeep, border: "none", borderRadius: 5, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          <Plus size={18} /> Add Activity
        </button>
      </div>

      {activities.length === 0 ? (
        <EmptyState text="No activity yet. Add an expense or income entry, or close an Operation to send its financials here." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Total Income" value={formatMoney(totalIncome, "USD")} color={C.green} />
            <StatCard label="Total Expense" value={formatMoney(totalExpense, "USD")} color={C.red} />
            <StatCard
              label="Net Profit"
              value={`${netProfit >= 0 ? "+" : ""}${formatMoney(netProfit, "USD")}`}
              color={netProfit >= 0 ? C.green : C.red}
              sub={margin !== null ? `${margin.toFixed(1)}% margin` : null}
            />
          </div>

          {clientRows.length > 0 && (
            <>
              <label style={{ ...labelStyle, marginBottom: 12, display: "block" }}>Net by Client</label>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 8px 8px", marginBottom: 28, height: Math.max(200, clientRows.length * 46) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientRows} layout="vertical" margin={{ left: 10, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke={C.border} />
                    <XAxis type="number" tickFormatter={(v) => formatMoney(v, "USD")} stroke={C.slateLight} fontSize={12} />
                    <YAxis type="category" dataKey="client" width={140} stroke={C.slateLight} fontSize={13} />
                    <Tooltip formatter={(v) => formatMoney(v, "USD")} />
                    <Bar dataKey="net" radius={[0, 4, 4, 0]}>
                      {clientRows.map((row, i) => (
                        <Cell key={i} fill={row.net >= 0 ? C.green : C.red} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <label style={{ ...labelStyle, marginBottom: 12, display: "block" }}>Report</label>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle}>From</label>
                <input type="date" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} style={filterSelectStyle} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input type="date" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} style={filterSelectStyle} />
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={fType} onChange={(e) => setFType(e.target.value)} style={filterSelectStyle}>
                  <option value={ALL_FILTER}>All</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Client</label>
                <select value={fClient} onChange={(e) => setFClient(e.target.value)} style={filterSelectStyle}>
                  <option value={ALL_FILTER}>All</option>
                  {clientOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={filterSelectStyle}>
                  <option value={ALL_FILTER}>All</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Source</label>
                <select value={fSource} onChange={(e) => setFSource(e.target.value)} style={filterSelectStyle}>
                  <option value={ALL_FILTER}>All</option>
                  <option value="manual">Manual Entry</option>
                  <option value="operation">From Operation</option>
                </select>
              </div>
            </div>
            <button
              onClick={resetFilters}
              style={{ marginTop: 12, background: "none", border: "none", color: C.slateLight, fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 0 }}
            >
              Clear filters
            </button>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, color: C.slateLight }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 14, color: C.green, fontWeight: 700 }}>Income {formatMoney(filteredIncome, "USD")}</span>
              <span style={{ fontSize: 14, color: C.red, fontWeight: 700 }}>Expense {formatMoney(filteredExpense, "USD")}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: filteredIncome - filteredExpense >= 0 ? C.green : C.red }}>
                Net {filteredIncome - filteredExpense >= 0 ? "+" : ""}
                {formatMoney(filteredIncome - filteredExpense, "USD")}
              </span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState text="No activity matches these filters." />
          ) : (
            filtered.map((a) => (
              <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: C.slateLight }}>{formatDate(a.date)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, textTransform: "uppercase" }}>{a.category}</span>
                    {a.client && <span style={{ fontSize: 13, color: C.slate }}>· {a.client}</span>}
                    {a.source === "operation" && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: `${C.blue}14`, padding: "2px 8px", borderRadius: 20 }}>FROM OPERATION</span>
                    )}
                  </div>
                  {a.description && <div style={{ fontSize: 14, color: "#333" }}>{a.description}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12.5, color: C.slateLight }}>{formatMoney(a.amount, a.currency)}</div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: a.type === "income" ? C.green : C.red }}>
                      {a.type === "income" ? "+" : "−"}
                      {formatMoney(a.usdAmount || 0, "USD")}
                    </div>
                  </div>
                  <IconButton title="Delete entry" danger onClick={() => deleteActivity(a.id)}>
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {showAddModal && <AddActivityModal onClose={() => setShowAddModal(false)} onSave={addActivity} rates={rates} ratesStatus={ratesStatus} />}
    </>
  );
}

/* ===================== MEMBERS ===================== */

function MemberModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim() || !username.trim() || !password.trim()) {
      setError("Full name, username, and password are all required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const authData = await supabaseSignUp(username.trim(), password);
      const [profile] = await supabaseInsertProfile(authData.access_token, {
        id: authData.user.id,
        full_name: name.trim(),
        username: username.trim(),
        role: role.trim() || null,
      });
      onSaved(profile);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Add Member">
      <label style={labelStyle}>Full Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ece Aydin" style={lightInputStyle} autoFocus />

      <label style={{ ...labelStyle, marginTop: 18 }}>Username</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ece.aydin" style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Temporary Password</label>
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a starting password" style={lightInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Role (optional)</label>
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Operations, Sales, Finance" style={lightInputStyle} />

      {error && <div style={{ color: C.red, fontSize: 13.5, marginTop: 14, lineHeight: 1.5 }}>{error}</div>}

      <div style={{ fontSize: 13, color: C.slateLight, marginTop: 16, lineHeight: 1.5 }}>
        This creates a real account. Share the username and password with your teammate so they can log in.
      </div>

      <button onClick={save} disabled={saving} style={{ ...primaryButton, opacity: saving ? 0.7 : 1, cursor: saving ? "default" : "pointer" }}>
        {saving ? "Creating account..." : "Add Member"}
      </button>
    </ModalShell>
  );
}

function MemberCard({ member, onDelete, isYou }) {
  const initial = member.full_name.trim().charAt(0).toUpperCase();
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.navyDeep, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navyDeep }}>
            {member.full_name}
            {isYou && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.slateLight }}> (you)</span>}
          </div>
          <div style={{ fontSize: 13.5, color: C.slateLight, marginTop: 2 }}>
            @{member.username}
            {member.role && ` · ${member.role}`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.green, background: `${C.green}14`, padding: "4px 12px", borderRadius: 20 }}>Active</span>
        {!isYou && (
          <IconButton title="Remove member" danger onClick={() => onDelete(member.id)}>
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function MembersPanel({ accessToken, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabaseFetchProfiles(accessToken)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function handleSaved(profile) {
    setMembers((prev) => [...prev, profile]);
  }

  async function deleteMember(id) {
    const prev = members;
    setMembers((cur) => cur.filter((m) => m.id !== id));
    try {
      await supabaseDeleteProfile(accessToken, id);
    } catch (err) {
      setMembers(prev); // roll back on failure
      setLoadError(err.message);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700, color: C.navyDeep, margin: 0 }}>Members</h1>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: C.gold, color: C.navyDeep, border: "none", borderRadius: 5, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            <Plus size={18} /> Add Member
          </button>
        </div>
        <p style={{ fontSize: 14.5, color: C.slateLight, marginTop: 10, lineHeight: 1.5 }}>
          Everyone who has real access to Alliance, pulled live from your account system.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.slateLight, fontSize: 16 }}>Loading members...</div>
      ) : loadError ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.red, fontSize: 16 }}>{loadError}</div>
      ) : members.length === 0 ? (
        <EmptyState text="No members yet." />
      ) : (
        members.map((m) => <MemberCard key={m.id} member={m} onDelete={deleteMember} isYou={m.id === currentUserId} />)
      )}

      {showModal && <MemberModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </>
  );
}

function PanelHeader({ title, buttonLabel, onAdd }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 26 }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700, color: C.navyDeep, margin: 0 }}>{title}</h1>
      <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: C.gold, color: C.navyDeep, border: "none", borderRadius: 5, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
        <Plus size={18} /> {buttonLabel}
      </button>
    </div>
  );
}

function FilterRow({ filter, setFilter }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
      {[{ key: "all", label: "All" }, ...Object.entries(STATUS).map(([key, s]) => ({ key, label: s.label }))].map((f) => (
        <button
          key={f.key}
          onClick={() => setFilter(f.key)}
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 20,
            cursor: "pointer",
            border: `1.5px solid ${filter === f.key ? C.navyDeep : C.border}`,
            background: filter === f.key ? C.navyDeep : "transparent",
            color: filter === f.key ? C.cream : C.slate,
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", padding: "60px 20px", color: C.slateLight, fontSize: 16 }}>{text}</div>;
}

function Dashboard({ session, onLogout }) {
  const displayName = session.profile?.full_name || session.authUser.email.split("@")[0];
  const [activeTab, setActiveTab] = useState("tasks");
  const [operations, setOperations] = useState(initialOperations);
  const [financeActivities, setFinanceActivities] = useState([]);
  const { rates, status: ratesStatus } = useExchangeRates();

  function convertQuoteToOperation(quoteData) {
    const newOperation = {
      id: Date.now(),
      title: quoteData.title,
      client: quoteData.client,
      description: quoteData.description,
      stages: emptyStages(),
      costItems: quoteData.costItems,
      revenueItems: quoteData.revenueItems,
      documents: [],
      closed: false,
    };
    setOperations((prev) => [newOperation, ...prev]);
    return newOperation.id;
  }

  function closeOperationToFinance(opData) {
    const newActivities = [];
    opData.costItems.forEach((item) => {
      newActivities.push({
        id: Date.now() + Math.random(),
        type: "expense",
        date: todayISO(),
        category: item.description || "Operation Cost",
        client: opData.client,
        description: `${opData.title} — ${item.description}`,
        amount: item.amount,
        currency: item.currency,
        usdAmount: toUSD(item.amount, item.currency, rates),
        source: "operation",
        operationId: opData.id,
      });
    });
    opData.revenueItems.forEach((item) => {
      newActivities.push({
        id: Date.now() + Math.random(),
        type: "income",
        date: todayISO(),
        category: item.description || "Operation Revenue",
        client: opData.client,
        description: `${opData.title} — ${item.description}`,
        amount: item.amount,
        currency: item.currency,
        usdAmount: toUSD(item.amount, item.currency, rates),
        source: "operation",
        operationId: opData.id,
      });
    });

    setFinanceActivities((prev) => [...newActivities, ...prev]);

    const closedOp = { ...opData, closed: true };
    setOperations((prev) => (prev.some((o) => o.id === closedOp.id) ? prev.map((o) => (o.id === closedOp.id ? closedOp : o)) : [closedOp, ...prev]));
  }

  return (
    <div style={{ minHeight: "100vh", background: C.cream, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONTS}</style>

      <div style={{ background: C.navyDeep, padding: "16px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Anchor size={22} color={C.gold} strokeWidth={1.8} />
            <Wordmark size="sm" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                disabled={!item.ready}
                onClick={() => item.ready && setActiveTab(item.key)}
                title={item.ready ? "" : "Coming soon"}
                style={{
                  padding: "9px 16px",
                  borderRadius: 5,
                  border: "none",
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: item.ready ? "pointer" : "default",
                  background: activeTab === item.key ? C.gold : item.ready ? "rgba(184,147,63,0.18)" : "transparent",
                  color: activeTab === item.key ? C.navyDeep : item.ready ? C.goldLight : C.slateLight,
                  opacity: item.ready ? 1 : 0.5,
                }}
              >
                {item.label}
                {!item.ready && <span style={{ fontSize: 10, marginLeft: 6 }}>SOON</span>}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 15, color: C.cream, fontWeight: 600 }}>{displayName}</span>
            <button onClick={onLogout} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: C.slateLight, fontSize: 14 }}>
              <LogOut size={16} /> Log Out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px 60px" }}>
        {activeTab === "tasks" && <TasksPanel currentUser={displayName} />}
        {activeTab === "operations" && (
          <OperationsPanel
            operations={operations}
            setOperations={setOperations}
            onCloseOperation={closeOperationToFinance}
            rates={rates}
            ratesStatus={ratesStatus}
          />
        )}
        {activeTab === "quotes" && <QuotesPanel onConvertToOperation={convertQuoteToOperation} rates={rates} ratesStatus={ratesStatus} />}
        {activeTab === "finance" && (
          <FinancePanel activities={financeActivities} setActivities={setFinanceActivities} rates={rates} ratesStatus={ratesStatus} />
        )}
        {activeTab === "members" && <MembersPanel accessToken={session.accessToken} currentUserId={session.authUser.id} />}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);

  async function handleLogin(authData) {
    let profile = null;
    try {
      const profiles = await supabaseFetchProfiles(authData.access_token);
      profile = profiles.find((p) => p.id === authData.user.id) || null;
    } catch (e) {
      // If the profile lookup fails, we still let the user in — display name just falls back to their email.
    }
    setSession({ accessToken: authData.access_token, refreshToken: authData.refresh_token, authUser: authData.user, profile });
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  return <Dashboard session={session} onLogout={() => setSession(null)} />;
}
