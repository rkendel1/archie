const { WorkClaimRegistry } = require('../coordination/work-claims');
const { DecisionRegistry } = require('../decisions/records');

class ControlPlaneState {
  constructor() {
    this.workClaims = new WorkClaimRegistry();
    this.decisions = new DecisionRegistry();
    this.lastSnapshot = null;
    this.contextItems = [];
    this.policyEvaluations = [];
    this.requirements = [];
    this.interventions = [];
    this.coordinationActions = [];
    this.participantContexts = [];
    this.completionHistory = [];
  }

  setSnapshot(snapshot) {
    this.lastSnapshot = snapshot;
  }

  addContextItem(item) {
    this.contextItems.unshift(item);
    this.contextItems = this.contextItems.slice(0, 300);
  }

  setPolicyEvaluations(evaluations = []) {
    this.policyEvaluations = Array.isArray(evaluations) ? evaluations : [];
  }

  setRequirements(requirements = []) {
    this.requirements = Array.isArray(requirements) ? requirements : [];
  }

  setInterventions(interventions = []) {
    this.interventions = Array.isArray(interventions) ? interventions : [];
  }

  setCoordinationActions(actions = []) {
    this.coordinationActions = Array.isArray(actions) ? actions : [];
  }

  setParticipantContexts(contexts = []) {
    this.participantContexts = Array.isArray(contexts) ? contexts : [];
  }

  addCompletionAttempt(attempt = {}) {
    this.completionHistory.unshift(attempt);
    this.completionHistory = this.completionHistory.slice(0, 100);
  }
}

module.exports = {
  ControlPlaneState
};
