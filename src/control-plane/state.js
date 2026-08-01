const { WorkClaimRegistry } = require('../coordination/work-claims');
const { DecisionRegistry } = require('../decisions/records');

class ControlPlaneState {
  constructor() {
    this.workClaims = new WorkClaimRegistry();
    this.decisions = new DecisionRegistry();
    this.lastSnapshot = null;
    this.contextItems = [];
  }

  setSnapshot(snapshot) {
    this.lastSnapshot = snapshot;
  }

  addContextItem(item) {
    this.contextItems.unshift(item);
    this.contextItems = this.contextItems.slice(0, 300);
  }
}

module.exports = {
  ControlPlaneState
};
