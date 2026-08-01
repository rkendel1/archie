function inferRuntimeTransports(model = {}, boundaries = []) {
  const transports = [];
  for (const boundary of boundaries) {
    const fromWorker = /worker/i.test(boundary.from);
    const toWorker = /worker/i.test(boundary.to);
    transports.push({
      id: `transport_${boundary.id}`,
      from: boundary.from,
      to: boundary.to,
      protocol: fromWorker || toWorker ? 'message-channel' : 'in-process-call',
      confidence: 0.74
    });
  }
  if ((model.discovery?.entryPoints || []).some((entry) => /http|server/i.test(entry))) {
    transports.push({
      id: 'transport_http_external',
      from: 'External Client',
      to: 'Node Development Runtime',
      protocol: 'http',
      confidence: 0.65
    });
  }
  return transports;
}

module.exports = {
  inferRuntimeTransports
};
