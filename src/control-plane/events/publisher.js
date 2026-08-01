function publishControlPlaneEvents(eventBus, events = [], context = {}) {
  if (!eventBus || !Array.isArray(events)) return;
  for (const event of events) {
    eventBus.publish(event.type, event.payload || {}, context);
  }
}

module.exports = {
  publishControlPlaneEvents
};
