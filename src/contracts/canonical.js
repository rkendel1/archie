const { inferContractRepresentations } = require('./representations');
const { inferContractParticipants } = require('./consumers');
const { assessCompatibility } = require('./compatibility');
const { confidenceFromEvidence } = require('../truth/confidence');

function buildCanonicalContract(model = {}, contract = {}) {
  const representations = inferContractRepresentations(model, contract);
  const participants = inferContractParticipants(model, contract);
  const compatibility = assessCompatibility(representations);
  const evidence = [{ type: 'repository-model', status: 'observed' }];
  return {
    id: `contract_${slug(contract.name || contract.file)}`,
    name: contract.name || baseName(contract.file),
    version: contract.version || null,
    canonicalSource: contract.file || null,
    representations,
    consumers: participants.consumers,
    producers: participants.producers,
    compatibility,
    evidence,
    confidence: confidenceFromEvidence(evidence)
  };
}

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function baseName(file = '') {
  return String(file).split('/').pop()?.replace(/\.[^.]+$/, '') || 'contract';
}

module.exports = {
  buildCanonicalContract
};
