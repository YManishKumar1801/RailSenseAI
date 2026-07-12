import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { auth, onAuthStateChanged, signOut } from './firebase';
import Login from './Login';
import Dashboard from './Dashboard';
import './App.css';

const API_BASE = 'http://localhost:5000';

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

// Parses "32h 45m" style duration strings into total minutes
function parseDurationToMinutes(duration) {
  const match = duration.match(/(\d+)h\s*(\d+)?m?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10) || 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + mins;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---- Journey Risk Analyzer (part of each TrainCard) ----
function JourneyRiskAnalyzer({ train }) {
  const [open, setOpen] = useState(false);
  const [journeyDate, setJourneyDate] = useState(todayDateString());
  const [eventDateTime, setEventDateTime] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function calculate() {
    setError('');
    if (!journeyDate || !eventDateTime) {
      setError('Please fill in both the journey date and your event date/time.');
      return;
    }

    const departureDT = new Date(`${journeyDate}T${train.departure_time}`);
    const journeyMinutes = parseDurationToMinutes(train.duration);
    const scheduledArrivalDT = new Date(departureDT.getTime() + journeyMinutes * 60000);
    const likelyArrivalDT = new Date(scheduledArrivalDT.getTime() + train.avg_delay_minutes * 60000);
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
      bufferMinutes,
      risk
    });
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
            <button onClick={calculate}>Calculate</button>
          </div>

          {error && <div className="risk-error">{error}</div>}

          {result && (
            <div className="risk-result">
              <div className="risk-badge" style={{ background: result.risk.color }}>{result.risk.level}</div>
              <p>{result.risk.msg}</p>
              <div className="risk-details">
                <span>Scheduled arrival: {result.scheduledArrivalLabel}</span>
                <span>Likely arrival (with delay): {result.likelyArrivalLabel}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrainCard({ train }) {
  const v = verdictFor(train.punctuality_score);
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
        </div>
        <div className="route-arrow">→ {train.duration} →</div>
        <div className="route-point">
          <div className="route-time">{train.arrival_time}</div>
          <div className="route-label">{train.destination}</div>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat"><span className="stat-label">Punctuality</span><span className="stat-value">{train.punctuality_score}/100</span></div>
        <div className="stat"><span className="stat-label">Avg Delay</span><span className="stat-value">{train.avg_delay_minutes} min</span></div>
        <div className="stat"><span className="stat-label">Cleanliness</span><span className="stat-value">{train.cleanliness_score}/100</span></div>
      </div>
      <div className="verdict" style={{ color: v.color }}>{v.text}</div>
      <JourneyRiskAnalyzer train={train} />
    </div>
  );
}

function ResultList({ trains }) {
  return (
    <div className="result-list">
      {trains.map((t, i) => (
        <div key={t.train_number} className={`result-item ${i === 0 ? 'best' : ''}`}>
          {i === 0 && trains.length > 1 && <div className="best-badge">★ Recommended</div>}
          <TrainCard train={t} />
        </div>
      ))}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('chat'); // 'chat' or 'dashboard'

  const DEFAULT_MESSAGE = { sender: 'bot', text: "Hi! I'm RailSense AI. Ask me about trains — e.g. 'Delhi to Chennai' or 'train 12951 status'." };

  const [messages, setMessages] = useState([DEFAULT_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSearch, setLastSearch] = useState(null); // { label, trains }
  const chatEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        const saved = localStorage.getItem(`railsense_chat_${currentUser.uid}`);
        if (saved) {
          try {
            setMessages(JSON.parse(saved));
          } catch (e) {
            // If saved data is corrupted, just keep the default welcome message
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-save chat history whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem(`railsense_chat_${user.uid}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  function clearChat() {
    setMessages([DEFAULT_MESSAGE]);
    if (user) {
      localStorage.setItem(`railsense_chat_${user.uid}`, JSON.stringify([DEFAULT_MESSAGE]));
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/api/chat`, { message: text });
      const { reply, trains, context } = res.data;

      if (trains && trains.length > 0) {
        setMessages(prev => [...prev, { sender: 'bot', text: reply, type: 'resultList', trains }]);

        // Build a readable label for this search, to show on the Dashboard
        let label = "Recent Search";
        if (context?.train_number) label = `Train #${context.train_number}`;
        else if (context?.train_name) label = context.train_name;
        else if (context?.source && context?.destination) label = `${context.source} → ${context.destination}`;

        setLastSearch({ label, trains });
      } else {
        setMessages(prev => [...prev, { sender: 'bot', text: reply }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: "Something went wrong. Please try again in a moment." }]);
    }
    setLoading(false);
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
        <div className="user-bar">
          <span>{user.email}</span>
          {view === 'chat' && <button onClick={clearChat}>🗑️ Clear Chat</button>}
          <button onClick={() => signOut(auth)}>Log Out</button>
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
                  {msg.type === 'resultList' && <ResultList trains={msg.trains} />}
                </div>
              </div>
            ))}
            {loading && <div className="message bot"><div className="bubble">Thinking...</div></div>}
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
            <button onClick={handleSend}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;