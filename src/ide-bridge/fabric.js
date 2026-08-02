const crypto = require('node:crypto');

const FABRIC_API_VERSION = {
  V1: 'V1'
};

const CAPABILITY_SOURCE = {
  VOLT_MANIFEST: 'VoltManifest',
  PLUGIN_RUNTIME: 'PluginRuntime',
  HOST_DERIVED: 'HostDerived',
  TEST: 'Test'
};

const FABRIC_SCOPE = {
  GLOBAL: 'Global',
  WORKSPACE: 'Workspace',
  DOCUMENT: 'Document',
  SESSION: 'Session'
};

const FABRIC_MODULE_STATE = {
  STARTING: 'Starting',
  READY: 'Ready',
  STOPPING: 'Stopping',
  FAILED: 'Failed'
};

const FABRIC_HEALTH = {
  UNKNOWN: 'Unknown',
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  UNHEALTHY: 'Unhealthy'
};

const FABRIC_ELIGIBILITY = {
  ELIGIBLE: 'Eligible',
  NOT_READY: 'NotReady',
  UNHEALTHY: 'Unhealthy',
  AT_CONCURRENCY_LIMIT: 'AtConcurrencyLimit',
  QUEUE_FULL: 'QueueFull',
  CAPABILITY_MISMATCH: 'CapabilityMismatch',
  POLICY_DENIED: 'PolicyDenied'
};

const FABRIC_FAILURE_KIND = {
  PLUGIN_UNAVAILABLE: 'PluginUnavailable',
  PLUGIN_CRASHED: 'PluginCrashed',
  TIMEOUT: 'Timeout',
  CANCELLED: 'Cancelled',
  INVALID_REQUEST: 'InvalidRequest',
  INVALID_RESPONSE: 'InvalidResponse',
  CAPABILITY_REJECTED: 'CapabilityRejected',
  RUNTIME_ERROR: 'RuntimeError'
};

const FABRIC_EXECUTION_OUTCOME = {
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  TIMED_OUT: 'TimedOut',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected'
};

const FABRIC_ROUTING_REASON = {
  NAMESPACE_MATCHED: 'NamespaceMatched',
  OPERATION_MATCHED: 'OperationMatched',
  EXACT_LANGUAGE_MATCH: 'ExactLanguageMatch',
  WILDCARD_LANGUAGE_MATCH: 'WildcardLanguageMatch',
  GENERIC_LANGUAGE_MATCH: 'GenericLanguageMatch',
  HIGHER_PRIORITY: 'HigherPriority',
  BETTER_HEALTH: 'BetterHealth',
  EXCLUDED_NOT_READY: 'ExcludedNotReady',
  EXCLUDED_UNHEALTHY: 'ExcludedUnhealthy',
  EXCLUDED_CAPABILITY_MISMATCH: 'ExcludedCapabilityMismatch',
  EXCLUDED_AT_CONCURRENCY: 'ExcludedAtConcurrencyLimit',
  EXCLUDED_QUEUE_FULL: 'ExcludedQueueFull',
  EXCLUDED_POLICY_DENIED: 'ExcludedPolicyDenied'
};

const FABRIC_ROUTE_MISS_REASON = {
  NO_REGISTERED_MODULES: 'NoRegisteredModules',
  NO_MATCHING_CAPABILITY: 'NoMatchingCapability',
  MATCHING_MODULES_NOT_READY: 'MatchingModulesNotReady',
  MATCHING_MODULES_UNHEALTHY: 'MatchingModulesUnhealthy',
  MATCHING_MODULES_AT_CAPACITY: 'MatchingModulesAtCapacity',
  DENIED_BY_POLICY: 'DeniedByPolicy'
};

const CAPABILITY_CONFLICT_KIND = {
  MULTIPLE_PROVIDERS: 'MultipleProviders',
  EQUAL_PRIORITY: 'EqualPriority',
  EQUAL_PRIORITY_AND_SPECIFICITY: 'EqualPriorityAndSpecificity',
  RESERVED_CAPABILITY_OVERRIDE: 'ReservedCapabilityOverride'
};

const FABRIC_AUDIT_EVENT = {
  CAPABILITY_REGISTERED: 'CapabilityRegistered',
  CAPABILITY_UPDATED: 'CapabilityUpdated',
  ROUTE_RESOLVED: 'RouteResolved',
  EXECUTION_STARTED: 'ExecutionStarted',
  EXECUTION_SUCCEEDED: 'ExecutionSucceeded',
  EXECUTION_FAILED: 'ExecutionFailed',
  EXECUTION_CANCELLED: 'ExecutionCancelled',
  MODULE_STATE_CHANGED: 'ModuleStateChanged',
  HEALTH_CHANGED: 'HealthChanged'
};

const KNOWN_NAMESPACES = new Set(['language', 'repository', 'workspace', 'code', 'ai', 'data', 'security', 'browser', 'system', 'host']);
const RESERVED_NAMESPACES = new Set(['system', 'host']);
const PRIORITY_MIN = -1000;
const PRIORITY_MAX = 1000;
const DEFAULT_CONCURRENCY = Object.freeze({ maxInFlight: null, maxQueueDepth: null });

function createFabricRoutingPolicy() {
  return {
    rank(_request, candidate) {
      return {
        priority: candidate.priority,
        specificity: candidate.specificity,
        health: candidate.healthScore,
        trust: candidate.trustScore
      };
    }
  };
}

function createFabric({ routingPolicy, executor, authorizer, now = () => new Date(), allowUnknownNamespaces = true } = {}) {
  const policy = routingPolicy && typeof routingPolicy.rank === 'function' ? routingPolicy : createFabricRoutingPolicy();
  const registrations = new Map();
  const registrationsByPluginId = new Map();
  const diagnostics = [];
  const audit = [];
  const runtimeRunning = new Map();
  const defaultExecutor = executor && typeof executor.execute === 'function' ? executor : null;
  const requestOutcomes = [];
  const capabilityIndex = new Map();
  const fallbackAuthorizer = createCapabilityAuthorizer({ allowUnknownNamespaces });
  let requestCounter = 0;
  let eventCounter = 0;

  function timestamp() {
    return now().toISOString();
  }

  function nextAuditId() {
    eventCounter += 1;
    return `fabric_event_${eventCounter.toString().padStart(6, '0')}`;
  }

  function emitAudit(event, payload = {}) {
    const entry = {
      eventId: nextAuditId(),
      timestamp: timestamp(),
      requestId: payload.requestId || null,
      registrationId: payload.registrationId || null,
      event,
      details: payload.details || {}
    };
    audit.push(entry);
    return entry;
  }

  function cloneCapability(entry) {
    return {
      capability: {
        apiVersion: entry.capability.apiVersion,
        key: {
          namespace: entry.capability.key.namespace,
          operation: entry.capability.key.operation,
          language: entry.capability.key.language || null
        },
        priority: entry.capability.priority,
        scope: entry.capability.scope
      },
      source: entry.source
    };
  }

  function toCapabilityKey({ namespace, operation, language }) {
    return `${namespace}::${operation}::${language || '*'}`;
  }

  function normalizePriority(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    if (parsed < PRIORITY_MIN || parsed > PRIORITY_MAX) {
      throw new Error(`fabric capability priority must be between ${PRIORITY_MIN} and ${PRIORITY_MAX}`);
    }
    return Math.trunc(parsed);
  }

  function normalizeScope(scope) {
    if (!scope) return FABRIC_SCOPE.GLOBAL;
    const normalized = String(scope);
    if (Object.values(FABRIC_SCOPE).includes(normalized)) return normalized;
    throw new Error(`Unsupported fabric scope: ${normalized}`);
  }

  function normalizeCapability(input, source) {
    const namespace = String(input.namespace || '').trim().toLowerCase();
    const operation = String(input.operation || '').trim().toLowerCase();
    const languageRaw = input.language == null ? null : String(input.language).trim().toLowerCase();
    const language = languageRaw || null;
    const apiVersion = input.apiVersion ? String(input.apiVersion).trim() : FABRIC_API_VERSION.V1;
    if (!namespace) throw new Error('fabric capability namespace is required');
    if (!operation) throw new Error('fabric capability operation is required');
    if (apiVersion !== FABRIC_API_VERSION.V1) throw new Error(`Unsupported fabric capability api version: ${apiVersion}`);
    if ((namespace === '*' || operation === '*') || (language && language.includes('*') && language !== '*')) {
      throw new Error('Wildcard "*" is only supported for language and must be exactly "*"');
    }
    if (!allowUnknownNamespaces && !KNOWN_NAMESPACES.has(namespace)) {
      throw new Error(`Unknown capability namespace: ${namespace}`);
    }
    return {
      capability: {
        apiVersion,
        key: { namespace, operation, language },
        priority: normalizePriority(input.priority),
        scope: normalizeScope(input.scope)
      },
      source
    };
  }

  function dedupeCapabilities(list) {
    const deduped = new Map();
    for (const entry of list) {
      const key = `${entry.capability.apiVersion}::${toCapabilityKey(entry.capability.key)}::${entry.capability.scope}`;
      const existing = deduped.get(key);
      if (!existing || entry.capability.priority > existing.capability.priority) {
        deduped.set(key, entry);
      }
    }
    return Array.from(deduped.values()).map(cloneCapability);
  }

  function capabilitiesFromManifest(manifest) {
    const declared = Array.isArray(manifest?.fabric?.capabilities) ? manifest.fabric.capabilities : [];
    const normalized = declared.map((entry) => normalizeCapability(entry || {}, CAPABILITY_SOURCE.VOLT_MANIFEST));
    return dedupeCapabilities(normalized);
  }

  function defaultMetrics() {
    return {
      in_flight: 0,
      queue_depth: 0,
      completed_requests: 0,
      failed_requests: 0,
      cancelled_requests: 0,
      average_latency_ms: null,
      last_success: null,
      last_failure: null
    };
  }

  function nextRegistrationId() {
    return `fabric_reg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  function nextRequestId() {
    requestCounter += 1;
    return `fabric_req_${requestCounter.toString().padStart(8, '0')}`;
  }

  function createRegistration(input = {}) {
    const pluginId = String(input.pluginId || `plugin_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);
    const registrationId = nextRegistrationId();
    const registrationToken = `fabric_tok_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const manifestCapabilities = capabilitiesFromManifest(input.voltManifest || {});
    const hostCapabilities = Array.isArray(input.capabilities) ? dedupeCapabilities(input.capabilities.map((entry) => normalizeCapability(entry || {}, CAPABILITY_SOURCE.HOST_DERIVED))) : [];
    const capabilities = dedupeCapabilities([...manifestCapabilities, ...hostCapabilities]);
    const declaredCapabilityKeys = new Set(manifestCapabilities.map((entry) => toCapabilityKey(entry.capability.key)));
    const registration = {
      registrationId,
      registrationToken,
      pluginId,
      participantId: String(input.participantId || ''),
      surfaceId: String(input.surfaceId || ''),
      moduleIdentity: {
        pluginId,
        participantId: String(input.participantId || ''),
        surfaceId: String(input.surfaceId || '')
      },
      state: FABRIC_MODULE_STATE.STARTING,
      health: FABRIC_HEALTH.UNKNOWN,
      healthTransitions: [],
      capabilities,
      declaredCapabilityKeys,
      runtimeMetrics: defaultMetrics(),
      concurrencyLimits: {
        maxInFlight: Number.isFinite(Number(input.concurrencyLimits?.maxInFlight)) ? Number(input.concurrencyLimits.maxInFlight) : DEFAULT_CONCURRENCY.maxInFlight,
        maxQueueDepth: Number.isFinite(Number(input.concurrencyLimits?.maxQueueDepth)) ? Number(input.concurrencyLimits.maxQueueDepth) : DEFAULT_CONCURRENCY.maxQueueDepth
      },
      permissionGrant: normalizePermissionGrant(input.permissionGrant || {}),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      stoppedAt: null,
      executor: input.executor && typeof input.executor.execute === 'function' ? input.executor : null,
      trustScore: Number.isFinite(Number(input.trustScore)) ? Number(input.trustScore) : 50,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      failureWindow: []
    };
    registrations.set(registrationId, registration);
    registrationsByPluginId.set(pluginId, registrationId);
    runtimeRunning.set(pluginId, {
      pluginId,
      fabric_registration_id: registrationId,
      fabricRegistrationId: registrationId,
      state: registration.state,
      startedAt: registration.createdAt
    });
    indexCapabilities(registration);
    emitAudit(FABRIC_AUDIT_EVENT.MODULE_STATE_CHANGED, {
      registrationId,
      details: { pluginId, state: registration.state }
    });
    emitAudit(FABRIC_AUDIT_EVENT.CAPABILITY_REGISTERED, {
      registrationId,
      details: { capabilities: registration.capabilities }
    });
    return {
      pluginId,
      registrationId,
      registrationToken,
      state: registration.state,
      capabilities: registration.capabilities.map(cloneCapability),
      runningPlugin: { ...runtimeRunning.get(pluginId) }
    };
  }

  function normalizePermissionGrant(input) {
    return {
      filesystem: input.filesystem || 'none',
      network: input.network || 'none',
      workspace: input.workspace || 'none',
      process: input.process || 'none'
    };
  }

  function getRegistration(registrationOrPlugin) {
    if (!registrationOrPlugin) return null;
    if (registrations.has(registrationOrPlugin)) return registrations.get(registrationOrPlugin);
    const registrationId = registrationsByPluginId.get(registrationOrPlugin);
    if (!registrationId) return null;
    return registrations.get(registrationId) || null;
  }

  function setState(registration, state, details = {}) {
    registration.state = state;
    registration.updatedAt = timestamp();
    if (runtimeRunning.has(registration.pluginId)) {
      runtimeRunning.set(registration.pluginId, {
        ...runtimeRunning.get(registration.pluginId),
        state,
        updatedAt: registration.updatedAt
      });
    }
    emitAudit(FABRIC_AUDIT_EVENT.MODULE_STATE_CHANGED, {
      registrationId: registration.registrationId,
      details: { state, ...details }
    });
  }

  function markReady(input = {}) {
    const registration = getRegistration(input.registrationId || input.pluginId);
    if (!registration) throw new Error('Unknown registration');
    setState(registration, FABRIC_MODULE_STATE.READY);
    setHealth(registration, FABRIC_HEALTH.HEALTHY);
    return describeRegistration(registration);
  }

  function setHealth(registration, health) {
    if (registration.health === health) return;
    registration.health = health;
    registration.healthTransitions.push({ health, at: timestamp() });
    emitAudit(FABRIC_AUDIT_EVENT.HEALTH_CHANGED, {
      registrationId: registration.registrationId,
      details: { health }
    });
  }

  function ensureToken(registration, token) {
    if (!token || String(token) !== registration.registrationToken) {
      throw new Error('Invalid fabric registration token');
    }
  }

  function indexCapabilities(registration) {
    for (const [key, set] of capabilityIndex.entries()) {
      if (set.has(registration.registrationId)) {
        set.delete(registration.registrationId);
        if (set.size === 0) capabilityIndex.delete(key);
      }
    }
    for (const entry of registration.capabilities) {
      const key = `${entry.capability.apiVersion}::${toCapabilityKey(entry.capability.key)}`;
      if (!capabilityIndex.has(key)) capabilityIndex.set(key, new Set());
      capabilityIndex.get(key).add(registration.registrationId);
    }
  }

  function registerCapabilities(params = {}) {
    const registration = getRegistration(params.registrationId);
    if (!registration) throw new Error('Unknown registration');
    ensureToken(registration, params.registrationToken);
    const inputCapabilities = Array.isArray(params.capabilities) ? params.capabilities : [];
    const normalized = dedupeCapabilities(inputCapabilities.map((entry) => normalizeCapability(entry || {}, CAPABILITY_SOURCE.PLUGIN_RUNTIME)));
    const activeAuthorizer = authorizer && typeof authorizer.authorize === 'function' ? authorizer : fallbackAuthorizer;
    const authorized = normalized.map((entry) => activeAuthorizer.authorize(registration.moduleIdentity, entry, registration));
    registration.capabilities = dedupeCapabilities([...registration.capabilities.filter((entry) => entry.source !== CAPABILITY_SOURCE.PLUGIN_RUNTIME), ...authorized]);
    registration.updatedAt = timestamp();
    indexCapabilities(registration);
    emitAudit(FABRIC_AUDIT_EVENT.CAPABILITY_UPDATED, {
      registrationId: registration.registrationId,
      details: { capabilities: registration.capabilities }
    });
    return describeRegistration(registration);
  }

  function reportHealth(params = {}) {
    const registration = getRegistration(params.registrationId || params.pluginId);
    if (!registration) throw new Error('Unknown registration');
    ensureToken(registration, params.registrationToken);
    const health = String(params.health || '').trim();
    if (!Object.values(FABRIC_HEALTH).includes(health)) throw new Error(`Unknown fabric health: ${health}`);
    setHealth(registration, health);
    return describeRegistration(registration);
  }

  function startupFailed(input = {}) {
    const registration = getRegistration(input.registrationId || input.pluginId);
    if (!registration) throw new Error('Unknown registration');
    setState(registration, FABRIC_MODULE_STATE.FAILED, { error: input.error || 'startup-failed' });
    unregister({ registrationId: registration.registrationId, reason: 'startup-failed' });
    return true;
  }

  function stop(input = {}) {
    const registration = getRegistration(input.registrationId || input.pluginId);
    if (!registration) return false;
    setState(registration, FABRIC_MODULE_STATE.STOPPING, { reason: input.reason || 'shutdown-requested' });
    unregister({ registrationId: registration.registrationId, reason: input.reason || 'shutdown-complete' });
    return true;
  }

  function unregister(input = {}) {
    const registration = getRegistration(input.registrationId || input.pluginId);
    if (!registration) return false;
    registration.stoppedAt = timestamp();
    registrations.delete(registration.registrationId);
    registrationsByPluginId.delete(registration.pluginId);
    runtimeRunning.delete(registration.pluginId);
    indexCapabilities({ ...registration, capabilities: [] });
    emitAudit(FABRIC_AUDIT_EVENT.MODULE_STATE_CHANGED, {
      registrationId: registration.registrationId,
      details: { state: 'Unregistered', reason: input.reason || 'manual' }
    });
    return true;
  }

  function normalizeRequest(request = {}) {
    const namespace = String(request.namespace || '').trim().toLowerCase();
    const operation = String(request.operation || '').trim().toLowerCase();
    const language = request.language == null ? null : String(request.language).trim().toLowerCase();
    if (!namespace) throw new Error('Fabric request namespace is required');
    if (!operation) throw new Error('Fabric request operation is required');
    return {
      namespace,
      operation,
      language: language || null
    };
  }

  function evaluateCandidate(registration, request) {
    refreshUnhealthyCooldown(registration);
    if (registration.state !== FABRIC_MODULE_STATE.READY) {
      return { eligible: false, reasons: [FABRIC_ROUTING_REASON.EXCLUDED_NOT_READY], eligibility: FABRIC_ELIGIBILITY.NOT_READY };
    }
    if (registration.health === FABRIC_HEALTH.UNHEALTHY) {
      return { eligible: false, reasons: [FABRIC_ROUTING_REASON.EXCLUDED_UNHEALTHY], eligibility: FABRIC_ELIGIBILITY.UNHEALTHY };
    }
    if (registration.concurrencyLimits.maxInFlight != null && registration.runtimeMetrics.in_flight >= registration.concurrencyLimits.maxInFlight) {
      return { eligible: false, reasons: [FABRIC_ROUTING_REASON.EXCLUDED_AT_CONCURRENCY], eligibility: FABRIC_ELIGIBILITY.AT_CONCURRENCY_LIMIT };
    }
    if (registration.concurrencyLimits.maxQueueDepth != null && registration.runtimeMetrics.queue_depth >= registration.concurrencyLimits.maxQueueDepth) {
      return { eligible: false, reasons: [FABRIC_ROUTING_REASON.EXCLUDED_QUEUE_FULL], eligibility: FABRIC_ELIGIBILITY.QUEUE_FULL };
    }
    const matched = [];
    for (const entry of registration.capabilities) {
      if (entry.capability.key.namespace !== request.namespace) continue;
      if (entry.capability.key.operation !== request.operation) continue;
      const capabilityLanguage = entry.capability.key.language;
      const requestLanguage = request.language;
      let specificity = 0;
      let languageReason = FABRIC_ROUTING_REASON.GENERIC_LANGUAGE_MATCH;
      if (requestLanguage) {
        if (capabilityLanguage === requestLanguage) {
          specificity = 3;
          languageReason = FABRIC_ROUTING_REASON.EXACT_LANGUAGE_MATCH;
        } else if (capabilityLanguage === '*') {
          specificity = 2;
          languageReason = FABRIC_ROUTING_REASON.WILDCARD_LANGUAGE_MATCH;
        } else if (!capabilityLanguage) {
          specificity = 1;
          languageReason = FABRIC_ROUTING_REASON.GENERIC_LANGUAGE_MATCH;
        } else {
          continue;
        }
      } else if (capabilityLanguage) {
        specificity = capabilityLanguage === '*' ? 1 : 2;
        languageReason = capabilityLanguage === '*' ? FABRIC_ROUTING_REASON.WILDCARD_LANGUAGE_MATCH : FABRIC_ROUTING_REASON.EXACT_LANGUAGE_MATCH;
      } else {
        specificity = 1;
      }
      matched.push({
        registration,
        capability: entry,
        specificity,
        reasons: [FABRIC_ROUTING_REASON.NAMESPACE_MATCHED, FABRIC_ROUTING_REASON.OPERATION_MATCHED, languageReason]
      });
    }
    if (!matched.length) {
      return { eligible: false, reasons: [FABRIC_ROUTING_REASON.EXCLUDED_CAPABILITY_MISMATCH], eligibility: FABRIC_ELIGIBILITY.CAPABILITY_MISMATCH };
    }
    matched.sort((a, b) => {
      if (b.capability.capability.priority !== a.capability.capability.priority) return b.capability.capability.priority - a.capability.capability.priority;
      return b.specificity - a.specificity;
    });
    const best = matched[0];
    const healthScore = registration.health === FABRIC_HEALTH.HEALTHY ? 3 : registration.health === FABRIC_HEALTH.DEGRADED ? 2 : 1;
    const candidate = {
      registrationId: registration.registrationId,
      pluginId: registration.pluginId,
      participantId: registration.participantId,
      capability: cloneCapability(best.capability),
      priority: best.capability.capability.priority,
      specificity: best.specificity,
      health: registration.health,
      healthScore,
      trustScore: registration.trustScore
    };
    return { eligible: true, reasons: best.reasons, candidate, eligibility: FABRIC_ELIGIBILITY.ELIGIBLE };
  }

  function compareScore(a, b) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.health !== b.health) return b.health - a.health;
    if (a.trust !== b.trust) return b.trust - a.trust;
    return 0;
  }

  function knownProviders(request) {
    return Array.from(registrations.values())
      .map((registration) => ({
        pluginId: registration.pluginId,
        registrationId: registration.registrationId,
        state: registration.state,
        health: registration.health,
        capabilities: registration.capabilities
          .filter((entry) => entry.capability.key.namespace === request.namespace && entry.capability.key.operation === request.operation)
          .map(cloneCapability)
      }))
      .filter((entry) => entry.capabilities.length > 0);
  }

  function route(requestInput = {}, routeContext = {}) {
    const request = normalizeRequest(requestInput);
    const evaluations = [];
    const readyMatches = [];
    for (const registration of registrations.values()) {
      const evaluated = evaluateCandidate(registration, request, routeContext);
      const base = {
        candidate: {
          registrationId: registration.registrationId,
          pluginId: registration.pluginId
        },
        eligible: evaluated.eligible,
        eligibility: evaluated.eligibility,
        reasons: evaluated.reasons.slice(),
        score: null
      };
      if (evaluated.eligible) {
        const score = policy.rank(request, evaluated.candidate, routeContext);
        base.score = score;
        base.candidate = { ...base.candidate, capability: evaluated.candidate.capability, health: evaluated.candidate.health };
        readyMatches.push({ ...evaluated, registration, score });
      }
      evaluations.push(base);
    }
    if (!registrations.size) {
      return {
        selected: null,
        considered: evaluations,
        miss: {
          request,
          reason: FABRIC_ROUTE_MISS_REASON.NO_REGISTERED_MODULES,
          known_providers: []
        }
      };
    }
    if (!readyMatches.length) {
      const providers = knownProviders(request);
      const reasons = evaluations.map((entry) => entry.eligibility);
      const reason = providers.length === 0
        ? FABRIC_ROUTE_MISS_REASON.NO_MATCHING_CAPABILITY
        : reasons.includes(FABRIC_ELIGIBILITY.NOT_READY)
          ? FABRIC_ROUTE_MISS_REASON.MATCHING_MODULES_NOT_READY
          : reasons.includes(FABRIC_ELIGIBILITY.UNHEALTHY)
            ? FABRIC_ROUTE_MISS_REASON.MATCHING_MODULES_UNHEALTHY
            : reasons.includes(FABRIC_ELIGIBILITY.AT_CONCURRENCY_LIMIT) || reasons.includes(FABRIC_ELIGIBILITY.QUEUE_FULL)
              ? FABRIC_ROUTE_MISS_REASON.MATCHING_MODULES_AT_CAPACITY
              : reasons.includes(FABRIC_ELIGIBILITY.POLICY_DENIED)
                ? FABRIC_ROUTE_MISS_REASON.DENIED_BY_POLICY
                : FABRIC_ROUTE_MISS_REASON.NO_MATCHING_CAPABILITY;
      return {
        selected: null,
        considered: evaluations,
        miss: {
          request,
          reason,
          known_providers: providers
        }
      };
    }
    readyMatches.sort((a, b) => {
      const compared = compareScore(a.score, b.score);
      if (compared !== 0) return compared;
      return a.registration.pluginId.localeCompare(b.registration.pluginId);
    });
    const selected = readyMatches[0];
    if (selected.score.priority > 0) selected.reasons.push(FABRIC_ROUTING_REASON.HIGHER_PRIORITY);
    if (selected.score.health > 1) selected.reasons.push(FABRIC_ROUTING_REASON.BETTER_HEALTH);
    const explanation = {
      selected: {
        registrationId: selected.registration.registrationId,
        pluginId: selected.registration.pluginId,
        capability: selected.candidate.capability,
        score: selected.score
      },
      considered: evaluations
    };
    emitAudit(FABRIC_AUDIT_EVENT.ROUTE_RESOLVED, {
      details: { request, selected: explanation.selected, considered: explanation.considered }
    });
    return explanation;
  }

  async function execute({ capability, payload, deadline = null, requestId = null, routeContext = {}, signal = null } = {}) {
    const request = normalizeRequest(capability || {});
    const effectiveRequestId = requestId || nextRequestId();
    const resolved = route(request, routeContext);
    if (!resolved.selected) {
      const rejected = {
        requestId: effectiveRequestId,
        outcome: FABRIC_EXECUTION_OUTCOME.REJECTED,
        route: resolved
      };
      requestOutcomes.push(rejected);
      return rejected;
    }
    const registration = registrations.get(resolved.selected.registrationId);
    if (!registration) {
      return {
        requestId: effectiveRequestId,
        outcome: FABRIC_EXECUTION_OUTCOME.FAILED,
        failure: FABRIC_FAILURE_KIND.PLUGIN_UNAVAILABLE
      };
    }
    const context = {
      request_id: effectiveRequestId,
      cancellation: signal || createCancellationToken(),
      deadline
    };
    registration.runtimeMetrics.in_flight += 1;
    emitAudit(FABRIC_AUDIT_EVENT.EXECUTION_STARTED, {
      requestId: effectiveRequestId,
      registrationId: registration.registrationId,
      details: { capability: request }
    });
    const startedAt = Date.now();
    const exec = registration.executor || defaultExecutor;
    if (!exec || typeof exec.execute !== 'function') {
      registration.runtimeMetrics.in_flight -= 1;
      recordFailure(registration, FABRIC_FAILURE_KIND.PLUGIN_UNAVAILABLE);
      const failureResult = {
        requestId: effectiveRequestId,
        outcome: FABRIC_EXECUTION_OUTCOME.FAILED,
        failure: FABRIC_FAILURE_KIND.PLUGIN_UNAVAILABLE,
        route: resolved
      };
      requestOutcomes.push(failureResult);
      return failureResult;
    }
    try {
      const response = await runWithDeadline({
        deadline,
        signal: context.cancellation,
        run: () => exec.execute({
          candidate: resolved.selected,
          request: {
            request_id: effectiveRequestId,
            capability: request,
            payload,
            deadline
          },
          context
        })
      });
      registration.runtimeMetrics.in_flight -= 1;
      registration.runtimeMetrics.completed_requests += 1;
      registration.runtimeMetrics.last_success = timestamp();
      updateAverageLatency(registration.runtimeMetrics, Date.now() - startedAt);
      recordSuccess(registration);
      emitAudit(FABRIC_AUDIT_EVENT.EXECUTION_SUCCEEDED, {
        requestId: effectiveRequestId,
        registrationId: registration.registrationId
      });
      const successResult = {
        requestId: effectiveRequestId,
        outcome: FABRIC_EXECUTION_OUTCOME.SUCCEEDED,
        response,
        route: resolved
      };
      requestOutcomes.push(successResult);
      return successResult;
    } catch (error) {
      registration.runtimeMetrics.in_flight -= 1;
      registration.runtimeMetrics.failed_requests += 1;
      registration.runtimeMetrics.last_failure = timestamp();
      const failure = classifyFailure(error);
      if (failure === FABRIC_FAILURE_KIND.CANCELLED) {
        registration.runtimeMetrics.cancelled_requests += 1;
      } else {
        recordFailure(registration, failure);
      }
      const outcome = failure === FABRIC_FAILURE_KIND.TIMEOUT
        ? FABRIC_EXECUTION_OUTCOME.TIMED_OUT
        : failure === FABRIC_FAILURE_KIND.CANCELLED
          ? FABRIC_EXECUTION_OUTCOME.CANCELLED
          : FABRIC_EXECUTION_OUTCOME.FAILED;
      emitAudit(outcome === FABRIC_EXECUTION_OUTCOME.CANCELLED ? FABRIC_AUDIT_EVENT.EXECUTION_CANCELLED : FABRIC_AUDIT_EVENT.EXECUTION_FAILED, {
        requestId: effectiveRequestId,
        registrationId: registration.registrationId,
        details: { failure }
      });
      const failedResult = {
        requestId: effectiveRequestId,
        outcome,
        failure,
        error: error.message,
        route: resolved
      };
      requestOutcomes.push(failedResult);
      return failedResult;
    }
  }

  function updateAverageLatency(metrics, latencyMs) {
    if (!Number.isFinite(metrics.average_latency_ms)) {
      metrics.average_latency_ms = latencyMs;
      return;
    }
    metrics.average_latency_ms = Math.round((metrics.average_latency_ms + latencyMs) / 2);
  }

  function classifyFailure(error) {
    const message = String(error?.message || '');
    if (error?.name === 'AbortError' || /cancel/i.test(message)) return FABRIC_FAILURE_KIND.CANCELLED;
    if (/timeout/i.test(message)) return FABRIC_FAILURE_KIND.TIMEOUT;
    if (/invalid request/i.test(message)) return FABRIC_FAILURE_KIND.INVALID_REQUEST;
    if (/invalid response/i.test(message)) return FABRIC_FAILURE_KIND.INVALID_RESPONSE;
    if (/capability/i.test(message) && /reject/i.test(message)) return FABRIC_FAILURE_KIND.CAPABILITY_REJECTED;
    return FABRIC_FAILURE_KIND.RUNTIME_ERROR;
  }

  function recordSuccess(registration) {
    registration.failureWindow = [];
    setHealth(registration, FABRIC_HEALTH.HEALTHY);
  }

  function recordFailure(registration, failureKind) {
    if (failureKind === FABRIC_FAILURE_KIND.CANCELLED) return;
    const nowMs = Date.now();
    registration.failureWindow.push(nowMs);
    registration.failureWindow = registration.failureWindow.filter((entry) => nowMs - entry <= 60000);
    if (registration.failureWindow.length >= 3) {
      setHealth(registration, FABRIC_HEALTH.UNHEALTHY);
      return;
    }
    setHealth(registration, FABRIC_HEALTH.DEGRADED);
  }

  function refreshUnhealthyCooldown(registration) {
    if (registration.health !== FABRIC_HEALTH.UNHEALTHY) return;
    const latestFailure = registration.failureWindow.length ? Math.max(...registration.failureWindow) : 0;
    if (latestFailure && Date.now() - latestFailure >= 30000) {
      setHealth(registration, FABRIC_HEALTH.UNKNOWN);
    }
  }

  function describeRegistration(registration) {
    return {
      registrationId: registration.registrationId,
      registrationToken: registration.registrationToken,
      pluginId: registration.pluginId,
      participantId: registration.participantId,
      surfaceId: registration.surfaceId,
      state: registration.state,
      health: registration.health,
      capabilities: registration.capabilities.map(cloneCapability),
      runtimeMetrics: { ...registration.runtimeMetrics },
      concurrencyLimits: { ...registration.concurrencyLimits },
      permissionGrant: { ...registration.permissionGrant },
      createdAt: registration.createdAt,
      updatedAt: registration.updatedAt,
      stoppedAt: registration.stoppedAt
    };
  }

  function listRegistrations() {
    return Array.from(registrations.values()).map((registration) => describeRegistration(registration));
  }

  function detectCapabilityConflicts() {
    const byKey = new Map();
    for (const registration of registrations.values()) {
      for (const entry of registration.capabilities) {
        const key = toCapabilityKey(entry.capability.key);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({
          pluginId: registration.pluginId,
          registrationId: registration.registrationId,
          priority: entry.capability.priority,
          specificity: entry.capability.key.language ? (entry.capability.key.language === '*' ? 1 : 2) : 0,
          source: entry.source
        });
      }
    }
    const conflicts = [];
    for (const [key, providers] of byKey.entries()) {
      if (providers.length < 2) continue;
      let conflictKind = CAPABILITY_CONFLICT_KIND.MULTIPLE_PROVIDERS;
      const priorities = new Set(providers.map((entry) => entry.priority));
      if (priorities.size === 1) {
        const specificities = new Set(providers.map((entry) => entry.specificity));
        conflictKind = specificities.size === 1 ? CAPABILITY_CONFLICT_KIND.EQUAL_PRIORITY_AND_SPECIFICITY : CAPABILITY_CONFLICT_KIND.EQUAL_PRIORITY;
      }
      const [namespace, operation, language] = key.split('::');
      if (RESERVED_NAMESPACES.has(namespace)) conflictKind = CAPABILITY_CONFLICT_KIND.RESERVED_CAPABILITY_OVERRIDE;
      conflicts.push({
        key: { namespace, operation, language: language === '*' ? null : language },
        providers,
        conflict_kind: conflictKind
      });
    }
    return conflicts;
  }

  function reconcile(runningPlugins) {
    const snapshots = Array.from(runningPlugins || []);
    const seenPlugins = new Set();
    const report = {
      missing_from_fabric: [],
      stale_registrations: [],
      stale_state: [],
      capability_drift: [],
      reconciled_at: timestamp()
    };
    for (const plugin of snapshots) {
      const pluginId = String(plugin.pluginId || plugin.id || '').trim();
      if (!pluginId) continue;
      seenPlugins.add(pluginId);
      const registration = getRegistration(pluginId);
      if (!registration) {
        report.missing_from_fabric.push({ pluginId });
        continue;
      }
      if (plugin.state && String(plugin.state) !== registration.state) {
        report.stale_state.push({
          pluginId,
          fabric_state: registration.state,
          runtime_state: String(plugin.state)
        });
      }
      if (plugin.voltManifest?.fabric?.capabilities) {
        const manifestCapabilities = capabilitiesFromManifest(plugin.voltManifest);
        const fabricManifestCaps = registration.capabilities.filter((entry) => entry.source === CAPABILITY_SOURCE.VOLT_MANIFEST);
        const manifestKeys = new Set(manifestCapabilities.map((entry) => toCapabilityKey(entry.capability.key)));
        const fabricKeys = new Set(fabricManifestCaps.map((entry) => toCapabilityKey(entry.capability.key)));
        const hasDrift = manifestKeys.size !== fabricKeys.size || Array.from(manifestKeys).some((key) => !fabricKeys.has(key));
        if (hasDrift) {
          report.capability_drift.push({ pluginId, manifestKeys: Array.from(manifestKeys), fabricKeys: Array.from(fabricKeys) });
        }
      }
    }
    for (const registration of registrations.values()) {
      if (!seenPlugins.has(registration.pluginId)) {
        report.stale_registrations.push({
          pluginId: registration.pluginId,
          registrationId: registration.registrationId
        });
      }
    }
    diagnostics.push(report);
    return report;
  }

  function fabricSnapshot() {
    return {
      modules: listRegistrations(),
      conflicts: detectCapabilityConflicts(),
      outcomes: requestOutcomes.slice(-100),
      audit: audit.slice(-500),
      diagnostics: diagnostics.slice(-100)
    };
  }

  return {
    register: createRegistration,
    markReady,
    startupFailed,
    stop,
    unregister,
    registerCapabilities,
    reportHealth,
    route,
    execute,
    reconcile,
    list: listRegistrations,
    inspect(registrationOrPlugin) {
      const registration = getRegistration(registrationOrPlugin);
      return registration ? describeRegistration(registration) : null;
    },
    snapshot: fabricSnapshot,
    detectCapabilityConflicts,
    getRunningPlugin(pluginId) {
      return runtimeRunning.get(pluginId) || null;
    }
  };
}

function createCapabilityAuthorizer({ allowUnknownNamespaces = true } = {}) {
  return {
    authorize(moduleIdentity, registeredCapability, registration) {
      const namespace = registeredCapability.capability.key.namespace;
      if (RESERVED_NAMESPACES.has(namespace)) {
        throw new Error(`Capability namespace is reserved: ${namespace}`);
      }
      if (!allowUnknownNamespaces && !KNOWN_NAMESPACES.has(namespace)) {
        throw new Error(`Unknown capability namespace: ${namespace}`);
      }
      if (registration?.declaredCapabilityKeys?.size && registeredCapability.source === CAPABILITY_SOURCE.PLUGIN_RUNTIME) {
        const key = toCapabilityKeySafe(registeredCapability.capability.key);
        if (!registration.declaredCapabilityKeys.has(key)) {
          throw new Error(`Capability rejected by manifest policy: ${key}`);
        }
      }
      return cloneRegisteredCapability(registeredCapability);
    }
  };
}

function cloneRegisteredCapability(entry) {
  return {
    capability: {
      apiVersion: entry.capability.apiVersion,
      key: { ...entry.capability.key },
      priority: entry.capability.priority,
      scope: entry.capability.scope
    },
    source: entry.source
  };
}

function toCapabilityKeySafe(key) {
  return `${key.namespace}::${key.operation}::${key.language || '*'}`;
}

function createCancellationToken() {
  let cancelled = false;
  return {
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    }
  };
}

async function runWithDeadline({ deadline, signal, run }) {
  if (signal?.aborted || signal?.cancelled) {
    const error = new Error('Execution cancelled');
    error.name = 'AbortError';
    throw error;
  }
  let timeoutId = null;
  let signalHandler = null;
  let timeoutMs = null;
  if (deadline) {
    const deadlineMs = typeof deadline === 'number' ? deadline : Date.parse(deadline);
    if (Number.isFinite(deadlineMs)) {
      timeoutMs = deadlineMs - Date.now();
      if (timeoutMs <= 0) throw new Error('Execution timeout');
    }
  }
  try {
    const runner = Promise.resolve().then(run);
    const raced = [runner];
    if (timeoutMs != null) {
      raced.push(new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Execution timeout')), timeoutMs);
      }));
    }
    if (signal && typeof signal.addEventListener === 'function') {
      raced.push(new Promise((_, reject) => {
        signalHandler = () => {
          const error = new Error('Execution cancelled');
          error.name = 'AbortError';
          reject(error);
        };
        signal.addEventListener('abort', signalHandler, { once: true });
      }));
    }
    return await Promise.race(raced);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal && signalHandler && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', signalHandler);
  }
}

module.exports = {
  FABRIC_API_VERSION,
  CAPABILITY_SOURCE,
  FABRIC_SCOPE,
  FABRIC_MODULE_STATE,
  FABRIC_HEALTH,
  FABRIC_ELIGIBILITY,
  FABRIC_FAILURE_KIND,
  FABRIC_EXECUTION_OUTCOME,
  FABRIC_ROUTING_REASON,
  FABRIC_ROUTE_MISS_REASON,
  CAPABILITY_CONFLICT_KIND,
  FABRIC_AUDIT_EVENT,
  createFabric,
  createFabricRoutingPolicy,
  createCapabilityAuthorizer
};
