import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { auth, onAuthStateChanged, signOut } from './firebase';
import Login from './Login';
import Dashboard from './Dashboard';
import Sidebar from './Sidebar';
import './App.css';

const API_BASE = 'http://localhost:5000';
const DEFAULT_MESSAGE = { sender: 'bot', text: "Hi! I'm RailSense AI. Ask me about trains — e.g. 'Delhi to Chennai' or 'train 12951 status'." };

function verdictFor(score) {
  if (score >= 80) return { text: "Highly reliable — safe to book!", color: "var(--signal-green)" };
  if (score >= 60) return { text: "Moderately reliable — keep buffer time.", color: "var(--signal-amber)" };
  return { text: "Frequently delayed — avoid tight connections.", color: "var(--signal-red)" };
}

function formatMinutes(mins) {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
}

function parseDurationToMinutes(duration) {
  const match = duration.match(/(\d+)h\s*(\d+)?m?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10) || 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + mins;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// Computes departure/arrival calendar dates using TODAY as the reference departure day.
// Recalculated fresh on every render, so it always reflects the current real-world date -
// e.g. viewed on Aug 7 it shows Aug 7/8; viewed tomorrow it shifts automatically.
function getScheduleDates(train) {
  const todayStr = todayDateString();
  const departureDT = new Date(`${todayStr}T${train.departure_time}`);
  const minutes = parseDurationToMinutes(train.duration);
  const arrivalDT = new Date(departureDT.getTime() + minutes * 60000);

  const fmt = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const dayOffset = Math.round(
    (new Date(arrivalDT.getFullYear(), arrivalDT.getMonth(), arrivalDT.getDate()) -
     new Date(departureDT.getFullYear(), departureDT.getMonth(), departureDT.getDate())) / 86400000
  );

  return {
    departureDateLabel: fmt(departureDT),
    arrivalDateLabel: fmt(arrivalDT),
    dayOffset
  };
}

// ---- Journey Risk Analyzer (part of each TrainCard) ----
function JourneyRiskAnalyzer({ train }) {
  const [open, setOpen] = useState(false);
  const [journeyDate, setJourneyDate] = useState(todayDateString());
  const [eventDateTime, setEventDateTime] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [calculating, setCalculating] = useState(false);

  async function calculate() {
    setError('');
    if (!journeyDate || !eventDateTime) {
      setError('Please fill in both the journey date and your event date/time.');
      return;
    }

    setCalculating(true);

    let expectedDelay = train.avg_delay_minutes;
    let usedML = false;
    try {
      const res = await axios.post(`${API_BASE}/api/predict-delay`, {
        train_number: train.train_number,
        date: journeyDate
      });
      expectedDelay = res.data.predicted_delay_minutes;
      usedML = true;
    } catch (err) {
      // ML service down or train not recognized - silently fall back to average
    }

    const departureDT = new Date(`${journeyDate}T${train.departure_time}`);
    const journeyMinutes = parseDurationToMinutes(train.duration);
    const scheduledArrivalDT = new Date(departureDT.getTime() + journeyMinutes * 60000);
    const likelyArrivalDT = new Date(scheduledArrivalDT.getTime() + expectedDelay * 60000);
    const eventDT = new Date(eventDateTime);

    const bufferMinutes = Math.round((eventDT - likelyArrivalDT) / 60000);

    let risk;
    if (bufferMinutes < 0) {
      risk = { level: "High Risk", color: "var(--signal-red)", msg: `You would likely arrive ${formatMinutes(Math.abs(bufferMinutes))} AFTER your event time. Consider an earlier train.` };
    } else if (bufferMinutes < 30) {
      risk = { level: "High Risk", color: "var(--signal-red)", msg: `Only ${formatMinutes(bufferMinutes)} buffer — too tight given this train's typical delays.` };
    } else if (bufferMinutes < 90) {
      risk = { level: "Moderate Risk", color: "var(--signal-amber)", msg: `${formatMinutes(bufferMinutes)} buffer time. Should be okay, but leave right after arrival.` };
    } else {
      risk = { level: "Safe", color: "var(--signal-green)", msg: `${formatMinutes(bufferMinutes)} buffer time — comfortable margin for this journey.` };
    }

    setResult({
      scheduledArrivalLabel: scheduledArrivalDT.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      likelyArrivalLabel: likelyArrivalDT.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      expectedDelay,
      usedML,
      bufferMinutes,
      risk
    });
    setCalculating(false);
  }

  return (
    <div className="risk-analyzer">
      <button className="risk-toggle-btn" onClick={() => setOpen(!open)}>
        {open ? "Hide journey risk check" : "🎯 Check journey risk (exam/flight/meeting)"}
      </button>

      {open && (
        <div className="risk-panel">
          <label>Journey date (when you'll board this train)</label>
          <input
            type="date"
            value={journeyDate}
            onChange={e => setJourneyDate(e.target.value)}
            className="risk-full-input"
          />

          <label>Your event date & time (exam/flight/meeting)</label>
          <div className="risk-input-row">
            <input
              type="datetime-local"
              value={eventDateTime}
              onChange={e => setEventDateTime(e.target.value)}
              className="risk-full-input"
            />
            <button onClick={calculate} disabled={calculating}>{calculating ? 'Calculating...' : 'Calculate'}</button>
          </div>

          {error && <div className="risk-error">{error}</div>}

          {result && (
            <div className="risk-result">
              <div className="risk-badge" style={{ background: result.risk.color }}>{result.risk.level}</div>
              <p>{result.risk.msg}</p>
              <div className="risk-details">
                <span>Scheduled arrival: {result.scheduledArrivalLabel}</span>
                <span>Likely arrival (with delay): {result.likelyArrivalLabel}</span>
                <span>
                  Expected delay: ~{result.expectedDelay} min
                  {result.usedML ? ' (ML-predicted)' : ' (historical average)'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Delay Explainer (Gemini-powered, part of each TrainCard) ----
function DelayExplainer({ train }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState('');

  async function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);

    // Only fetch once - cache the result so re-opening doesn't re-call Gemini
    if (nextOpen && !explanation && !loadingExplanation) {
      setLoadingExplanation(true);
      setError('');
      try {
        const res = await axios.post(`${API_BASE}/api/explain-delay`, {
          train_number: train.train_number
        });
        setExplanation(res.data.explanation);
      } catch (err) {
        setError('Could not generate an explanation right now. Please try again.');
      }
      setLoadingExplanation(false);
    }
  }

  return (
    <div className="delay-explainer">
      <button className="explain-toggle-btn" onClick={toggleOpen}>
        {open ? "Hide explanation" : "🔍 Why is this train typically delayed?"}
      </button>

      {open && (
        <div className="explain-panel">
          {loadingExplanation && (
            <div className="thinking-dots"><span></span><span></span><span></span></div>
          )}
          {error && <div className="risk-error">{error}</div>}
          {explanation && <p className="explain-text">{explanation}</p>}
        </div>
      )}
    </div>
  );
}

function TrainCard({ train, windowUsed }) {
  // If this card came from a route search, show the SAME window-specific number
  // that was actually used to rank it (30/60/90 day on-time %) instead of the
  // blended overall score — otherwise the "Recommended" pick can look inconsistent.
  const displayScore = windowUsed ? train[`on_time_pct_${windowUsed}d`] : train.punctuality_score;
  const scoreLabel = windowUsed ? `Punctuality (${windowUsed}d)` : "Punctuality";
  const v = verdictFor(displayScore);
  const schedule = getScheduleDates(train);

  return (
    <div className="train-card">
      <div className="train-card-header">
        <span className="train-name">{train.train_name}</span>
        <span className="train-number">#{train.train_number}</span>
      </div>
      <div className="route-line">
        <div className="route-point">
          <div className="route-time">{train.departure_time}</div>
          <div className="route-label">{train.source}</div>
          <div className="route-date">{schedule.departureDateLabel}</div>
        </div>
        <div className="route-arrow">→ {train.duration} →</div>
        <div className="route-point">
          <div className="route-time">
            {train.arrival_time}
            {schedule.dayOffset > 0 && <span className="day-offset-badge">+{schedule.dayOffset}d</span>}
          </div>
          <div className="route-label">{train.destination}</div>
          <div className="route-date">{schedule.arrivalDateLabel}</div>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat"><span className="stat-label">{scoreLabel}</span><span className="stat-value">{displayScore}{windowUsed ? '%' : '/100'}</span></div>
        <div className="stat"><span className="stat-label">Avg Delay</span><span className="stat-value">{train.avg_delay_minutes} min</span></div>
        <div className="stat"><span className="stat-label">Cleanliness</span><span className="stat-value">{train.cleanliness_score}/100</span></div>
      </div>
      <div className="verdict" style={{ color: v.color }}>{v.text}</div>
      <JourneyRiskAnalyzer train={train} />
      <DelayExplainer train={train} />
    </div>
  );
}

function ResultList({ trains, windowUsed }) {
  return (
    <div className="result-list">
      {trains.map((t, i) => (
        <div key={t.train_number} className={`result-item ${i === 0 ? 'best' : ''}`}>
          {i === 0 && trains.length > 1 && <div className="best-badge">★ Recommended</div>}
          <TrainCard train={t} windowUsed={windowUsed} />
        </div>
      ))}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('chat');

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([DEFAULT_MESSAGE]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSearch, setLastSearch] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    try {
      const res = await axios.get(`${API_BASE}/api/conversations/${user.uid}`);
      let list = res.data;

      if (list.length === 0) {
        const created = await axios.post(`${API_BASE}/api/conversation`, {
          user_id: user.uid, title: "New Chat", messages: [DEFAULT_MESSAGE]
        });
        setConversations([{ _id: created.data._id, title: created.data.title, updatedAt: created.data.updatedAt }]);
        setActiveConversationId(created.data._id);
        setMessages([DEFAULT_MESSAGE]);
      } else {
        setConversations(list);
        const mostRecentId = list[0]._id;
        setActiveConversationId(mostRecentId);
        const full = await axios.get(`${API_BASE}/api/conversation/${mostRecentId}`);
        setMessages(full.data.messages?.length > 0 ? full.data.messages : [DEFAULT_MESSAGE]);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setMessages([DEFAULT_MESSAGE]);
    }
  }

  async function saveCurrentConversation(updatedMessages, newTitle) {
    if (!activeConversationId) return;
    try {
      const payload = { messages: updatedMessages };
      if (newTitle) payload.title = newTitle;
      await axios.put(`${API_BASE}/api/conversation/${activeConversationId}`, payload);
      const listRes = await axios.get(`${API_BASE}/api/conversations/${user.uid}`);
      setConversations(listRes.data);
    } catch (err) {
      console.error("Failed to save conversation:", err);
    }
  }

  async function handleNewChat() {
    try {
      const created = await axios.post(`${API_BASE}/api/conversation`, {
        user_id: user.uid, title: "New Chat", messages: [DEFAULT_MESSAGE]
      });
      setConversations(prev => [{ _id: created.data._id, title: created.data.title, updatedAt: created.data.updatedAt }, ...prev]);
      setActiveConversationId(created.data._id);
      setMessages([DEFAULT_MESSAGE]);
      setView('chat');
    } catch (err) {
      console.error("Failed to create new chat:", err);
    }
  }

  async function handleSelectConversation(id) {
    if (id === activeConversationId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/conversation/${id}`);
      setActiveConversationId(id);
      setMessages(res.data.messages?.length > 0 ? res.data.messages : [DEFAULT_MESSAGE]);
      setView('chat');
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }

  async function handleDeleteConversation(id) {
    try {
      await axios.delete(`${API_BASE}/api/conversation/${id}`);
      const updatedList = conversations.filter(c => c._id !== id);
      setConversations(updatedList);

      if (id === activeConversationId) {
        if (updatedList.length > 0) {
          handleSelectConversation(updatedList[0]._id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }

  async function handleRenameConversation(id, newTitle) {
    try {
      await axios.put(`${API_BASE}/api/conversation/${id}`, { title: newTitle });
      setConversations(prev => prev.map(c => c._id === id ? { ...c, title: newTitle } : c));
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  }

  async function handleSend(textOverride) {
    const text = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!text) return;

    const activeConvMeta = conversations.find(c => c._id === activeConversationId);
    const isFirstMessage = activeConvMeta ? activeConvMeta.title === "New Chat" : false;
    const newTitle = isFirstMessage ? (text.length > 40 ? text.slice(0, 40) + '…' : text) : null;

    const afterUserMsg = [...messages, { sender: 'user', text }];
    setMessages(afterUserMsg);
    setInput('');
    setLoading(true);

    let finalMessages;
    try {
      const res = await axios.post(`${API_BASE}/api/chat`, { message: text });
      const { reply, trains, context } = res.data;

      if (trains && trains.length > 0) {
        // Route searches always rank by a specific window (default 90d) - carry that
        // through so the card can show the matching number, not the blended score.
        const windowUsed = (context?.source && context?.destination)
          ? (context.time_window || 90)
          : null;

        finalMessages = [...afterUserMsg, { sender: 'bot', text: reply, type: 'resultList', trains, windowUsed }];

        let label = "Recent Search";
        if (context?.train_number) label = `Train #${context.train_number}`;
        else if (context?.train_name) label = context.train_name;
        else if (context?.source && context?.destination) label = `${context.source} → ${context.destination}`;
        setLastSearch({ label, trains });
      } else {
        finalMessages = [...afterUserMsg, { sender: 'bot', text: reply }];
      }
    } catch (err) {
      finalMessages = [...afterUserMsg, { sender: 'bot', text: "Something went wrong. Please try again in a moment." }];
    }

    setMessages(finalMessages);
    setLoading(false);
    saveCurrentConversation(finalMessages, newTitle);
  }

  async function handleDeleteConversation(id) {
    try {
      await axios.delete(`${API_BASE}/api/conversation/${id}`);
      const updatedList = conversations.filter(c => c._id !== id);
      setConversations(updatedList);

      if (id === activeConversationId) {
        if (updatedList.length > 0) {
          handleSelectConversation(updatedList[0]._id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }

  async function handleRenameConversation(id, newTitle) {
    try {
      await axios.put(`${API_BASE}/api/conversation/${id}`, { title: newTitle });
      setConversations(prev => prev.map(c => c._id === id ? { ...c, title: newTitle } : c));
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSend();
  }

  if (authLoading) {
    return <div className="login-page"><p style={{ color: 'white' }}>Loading...</p></div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        userEmail={user.email}
        onLogout={() => signOut(auth)}
      />

      <div className={`app ${view === 'dashboard' ? 'app-wide' : ''}`}>
        <div className="header">
          <div className="signal-dot" aria-hidden="true"></div>
          <p className="eyebrow">RailSense AI</p>
          <h1>RailSense AI</h1>
          <p className="header-subtitle">Punctuality-first train recommendations</p>
          <div className="view-tabs">
            <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>💬 Chat</button>
            <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>📊 Dashboard</button>
          </div>
        </div>

        {view === 'dashboard' ? (
          <Dashboard lastSearch={lastSearch} />
        ) : (
          <>
            <div className="chat-window">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.sender}`}>
                  <div className="bubble-column">
                    {msg.text && <div className="bubble">{msg.text}</div>}
                    {msg.type === 'resultList' && <ResultList trains={msg.trains} windowUsed={msg.windowUsed} />}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="message bot">
                  <div className="bubble thinking-bubble">
                    <div className="thinking-dots"><span></span><span></span><span></span></div>
                  </div>
                </div>
              )}
              {messages.length === 1 && !loading && (
                <div className="suggestion-chips">
                  <p className="suggestion-label">Try asking:</p>
                  <div className="chip-row">
                    <button className="chip" onClick={() => handleSend('Delhi to Mumbai')}>Delhi to Mumbai</button>
                    <button className="chip" onClick={() => handleSend('train 12951 status')}>train 12951 status</button>
                    <button className="chip" onClick={() => handleSend('best train Bangalore to Chennai in last 30 days')}>Bangalore → Chennai (30 days)</button>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="input-bar">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a train or route... e.g. Delhi to Chennai"
              />
              <button onClick={() => handleSend()}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;