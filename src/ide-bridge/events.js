function createEventStore() {
  const events = [];
  return {
    append(type, payload) {
      const event = {
        type,
        payload,
        recordedAt: new Date().toISOString()
      };
      events.push(event);
      return event;
    },
    list(type) {
      if (!type) return events.slice();
      return events.filter((event) => event.type === type);
    }
  };
}

module.exports = { createEventStore };
