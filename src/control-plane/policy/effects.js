function createEffect(type, input = {}) {
  return { type, ...input };
}

module.exports = {
  createEffect
};
