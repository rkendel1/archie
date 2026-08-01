function inferRuntimeBoundaries(runtimes = []) {
  const items = Array.isArray(runtimes) ? runtimes : [];
  if (items.length <= 1) return [];
  const boundaries = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      boundaries.push({
        id: `boundary_${slug(items[i])}_${slug(items[j])}`,
        from: items[i],
        to: items[j],
        isolation: /worker/i.test(items[i]) || /worker/i.test(items[j]) ? 'process' : 'logical'
      });
    }
  }
  return boundaries;
}

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

module.exports = {
  inferRuntimeBoundaries
};
