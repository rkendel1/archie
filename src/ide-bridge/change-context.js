const { validateOpenChangeRequest, validateContextUpdate } = require('./protocol');

function createChangeController(sessions, events) {
  return {
    openChange(request) {
      const normalized = validateOpenChangeRequest(request);
      const project = sessions.getProject(normalized.projectId);
      if (!project) throw new Error(`Unknown project for change: ${normalized.projectId}`);
      const change = sessions.registerChange(normalized);
      events.append('change.opened', change);
      return {
        changeSessionId: change.changeSessionId,
        projectId: change.projectId,
        title: change.title,
        files: change.files,
        constraints: change.constraints,
        openedAt: change.openedAt
      };
    },
    updateContext(update) {
      const normalized = validateContextUpdate(update);
      const change = sessions.getChange(normalized.changeSessionId);
      if (!change) throw new Error(`Unknown change session: ${normalized.changeSessionId}`);
      const context = {
        ...normalized,
        recordedAt: new Date().toISOString()
      };
      events.append('context.updated', context);
      return context;
    }
  };
}

module.exports = { createChangeController };
