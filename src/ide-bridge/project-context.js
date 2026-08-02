const { validateOpenProjectRequest } = require('./protocol');

function createProjectController(sessions, events) {
  return {
    openProject(request) {
      const normalized = validateOpenProjectRequest(request);
      const project = sessions.registerProject(normalized);
      events.append('project.opened', project);
      return {
        projectId: project.projectId,
        projectName: project.projectName,
        repositoryRoot: project.repositoryRoot,
        supportedSurfaces: project.supportedSurfaces,
        openedAt: project.openedAt
      };
    }
  };
}

module.exports = { createProjectController };
