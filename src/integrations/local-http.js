function localHttpEndpoint(port = 4317) {
  return `http://127.0.0.1:${port}/v1/agent`;
}

module.exports = {
  localHttpEndpoint
};
