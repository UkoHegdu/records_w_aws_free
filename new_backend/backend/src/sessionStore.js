/**
 * In-memory session store for the unified backend.
 * Sessions are lost on process restart. See backend/DifferencesWithAWS.md.
 */
const sessions = new Map();

function saveSession(sessionData) {
  sessions.set(sessionData.session_id, { ...sessionData });
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function updateSession(sessionId, updates) {
  const existing = sessions.get(sessionId);
  if (!existing) return false;
  sessions.set(sessionId, { ...existing, ...updates });
  return true;
}

function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

module.exports = {
  saveSession,
  getSession,
  updateSession,
  deleteSession,
};
