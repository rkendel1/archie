const EventEmitter = require('node:events');

class RuntimeEventBus extends EventEmitter {
  constructor(repositoryId) {
    super();
    this.repositoryId = repositoryId;
    this.sequence = 0;
    this.events = [];
    this.maxEvents = 1000;
  }

  publish(type, payload = {}, context = {}) {
    const event = {
      type,
      repository_id: this.repositoryId,
      model_version: context.modelVersion ?? null,
      change_session_id: context.changeSessionId ?? null,
      timestamp: new Date().toISOString(),
      sequence: ++this.sequence,
      payload
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.emit('event', event);
    return event;
  }

  list(sinceSequence = 0) {
    return this.events.filter((event) => event.sequence > sinceSequence);
  }
}

module.exports = { RuntimeEventBus };
