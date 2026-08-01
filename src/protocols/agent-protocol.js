const { SUPPORTED_CAPABILITIES } = require('../agents/agent-capabilities');

function protocolDescriptor(repositoryId, modelVersion) {
  return {
    name: 'Archie Agent Participation Runtime',
    protocol_version: '1.0',
    repository: {
      id: repositoryId,
      model_version: modelVersion
    },
    capabilities: [
      'intent',
      'context',
      'plan_review',
      'constraints',
      'change_observation',
      'evidence',
      'verification',
      'completion'
    ],
    services: {
      endpoint: 'http://127.0.0.1:4317/v1/agent',
      supported_agent_capabilities: SUPPORTED_CAPABILITIES
    }
  };
}

module.exports = {
  protocolDescriptor
};
