const crypto = require('node:crypto');

function createSessions() {
  const connectionById = new Map();
  const projects = new Map();
  const changes = new Map();

  return {
    registerConnection(connection) {
      const connectionId = `ide_connection_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const saved = { ...connection, connectionId, connectedAt: new Date().toISOString() };
      connectionById.set(connectionId, saved);
      return saved;
    },
    registerProject(project) {
      const saved = {
        ...project,
        openedAt: new Date().toISOString()
      };
      projects.set(saved.projectId, saved);
      return saved;
    },
    registerChange(change) {
      const saved = {
        ...change,
        openedAt: new Date().toISOString()
      };
      changes.set(saved.changeSessionId, saved);
      return saved;
    },
    getProject(projectId) {
      return projects.get(projectId) || null;
    },
    getChange(changeSessionId) {
      return changes.get(changeSessionId) || null;
    },
    summary() {
      return {
        activeConnections: connectionById.size,
        openProjects: projects.size,
        openChanges: changes.size
      };
    }
  };
}

module.exports = { createSessions };
