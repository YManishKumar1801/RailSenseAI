import { useState } from 'react';
import './Sidebar.css';

function Sidebar({ conversations, activeId, onSelect, onNewChat, onDelete, onRename, userEmail, onLogout }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function startRename(e, conv) {
    e.stopPropagation();
    setEditingId(conv._id);
    setEditText(conv.title);
  }

  function submitRename(id) {
    const trimmed = editText.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  }

  function handleDeleteClick(e, id) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  function confirmDelete(e, id) {
    e.stopPropagation();
    onDelete(id);
    setConfirmDeleteId(null);
  }

  function cancelDelete(e) {
    e.stopPropagation();
    setConfirmDeleteId(null);
  }

  return (
    <div className="sidebar">
      <button className="new-chat-btn" onClick={onNewChat}>+ New Chat</button>

      <div className="conversation-list">
        <p className="sidebar-label">Recents</p>
        {conversations.length === 0 && (
          <p className="sidebar-empty">No conversations yet</p>
        )}
        {conversations.map(conv => (
          <div
            key={conv._id}
            className={`conversation-item ${conv._id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(conv._id)}
          >
            {editingId === conv._id ? (
              <input
                className="rename-input"
                value={editText}
                autoFocus
                onClick={e => e.stopPropagation()}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => submitRename(conv._id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitRename(conv._id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : confirmDeleteId === conv._id ? (
              <div className="confirm-delete-row">
                <span>Delete this chat?</span>
                <button className="confirm-yes" onClick={(e) => confirmDelete(e, conv._id)}>Yes</button>
                <button className="confirm-no" onClick={cancelDelete}>No</button>
              </div>
            ) : (
              <>
                <div className="conversation-main">
                  <div className="conversation-title">{conv.title}</div>
                  <div className="conversation-time">{formatTime(conv.updatedAt)}</div>
                </div>
                <div className="item-actions">
                  <button className="icon-btn" title="Rename" onClick={(e) => startRename(e, conv)}>✎</button>
                  <button className="icon-btn" title="Delete" onClick={(e) => handleDeleteClick(e, conv._id)}>🗑</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-account">
        <span className="account-email">{userEmail}</span>
        <button className="logout-btn" onClick={onLogout}>Log Out</button>
      </div>
    </div>
  );
}

export default Sidebar;