const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFabric,
  CAPABILITY_SOURCE,
  FABRIC_MODULE_STATE,
  FABRIC_ROUTE_MISS_REASON,
  FABRIC_EXECUTION_OUTCOME,
  FABRIC_FAILURE_KIND
} = require('../src/ide-bridge');

test('fabric stores registration token on running plugin and lifecycle transitions through shutdown', () => {
  const fabric = createFabric();
  const registered = fabric.register({
    pluginId: 'lapce-rustfmt',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce',
    voltManifest: {
      fabric: {
        capabilities: [
          { namespace: 'language', operation: 'format', language: 'rust', priority: 100 }
        ]
      }
    }
  });

  const running = fabric.getRunningPlugin('lapce-rustfmt');
  assert.equal(running.fabric_registration_id, registered.registrationId);
  assert.equal(registered.state, FABRIC_MODULE_STATE.STARTING);

  const ready = fabric.markReady({ registrationId: registered.registrationId });
  assert.equal(ready.state, FABRIC_MODULE_STATE.READY);

  const stopped = fabric.stop({ pluginId: 'lapce-rustfmt', reason: 'shutdown-requested' });
  assert.equal(stopped, true);
  assert.equal(fabric.inspect(registered.registrationId), null);
});

test('fabric unregisters failed startup plugins', () => {
  const fabric = createFabric();
  const registered = fabric.register({
    pluginId: 'lapce-crashy',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce'
  });
  fabric.startupFailed({ registrationId: registered.registrationId, error: 'boot failed' });
  assert.equal(fabric.inspect(registered.registrationId), null);
});

test('fabric parses manifest capabilities with provenance and rejects unauthorized runtime declarations', () => {
  const fabric = createFabric();
  const registered = fabric.register({
    pluginId: 'lapce-analyzer',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce',
    voltManifest: {
      fabric: {
        capabilities: [
          { namespace: 'language', operation: 'diagnose', language: 'rust', priority: 90 },
          { namespace: 'language', operation: 'diagnose', language: 'rust', priority: 80 }
        ]
      }
    }
  });

  const inspected = fabric.inspect(registered.registrationId);
  assert.equal(inspected.capabilities.length, 1);
  assert.equal(inspected.capabilities[0].source, CAPABILITY_SOURCE.VOLT_MANIFEST);
  assert.equal(inspected.capabilities[0].capability.priority, 90);

  assert.throws(
    () =>
      fabric.registerCapabilities({
        registrationId: registered.registrationId,
        registrationToken: registered.registrationToken,
        capabilities: [{ namespace: 'repository', operation: 'analyze', priority: 50 }]
      }),
    /Capability rejected by manifest policy/
  );
});

test('fabric routing explains exact-match selection and structured route misses', () => {
  const fabric = createFabric();
  const rust = fabric.register({
    pluginId: 'rustfmt',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce',
    voltManifest: {
      fabric: {
        capabilities: [{ namespace: 'language', operation: 'format', language: 'rust', priority: 100 }]
      }
    }
  });
  const generic = fabric.register({
    pluginId: 'generic-format',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce',
    voltManifest: {
      fabric: {
        capabilities: [{ namespace: 'language', operation: 'format', language: '*', priority: 10 }]
      }
    }
  });
  fabric.markReady({ registrationId: rust.registrationId });
  fabric.markReady({ registrationId: generic.registrationId });

  const route = fabric.route({ namespace: 'language', operation: 'format', language: 'rust' });
  assert.equal(route.selected.pluginId, 'rustfmt');
  assert.ok(route.considered.length >= 2);

  fabric.stop({ registrationId: rust.registrationId });
  fabric.stop({ registrationId: generic.registrationId });

  const miss = fabric.route({ namespace: 'language', operation: 'format', language: 'rust' });
  assert.equal(miss.selected, null);
  assert.equal(miss.miss.reason, FABRIC_ROUTE_MISS_REASON.NO_REGISTERED_MODULES);
});

test('fabric execute records timeout and cancellation as non-success outcomes', async () => {
  const fabric = createFabric({
    executor: {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { ok: true };
      }
    }
  });
  const registered = fabric.register({
    pluginId: 'executor-plugin',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce',
    voltManifest: {
      fabric: {
        capabilities: [{ namespace: 'repository', operation: 'analyze', priority: 50 }]
      }
    }
  });
  fabric.markReady({ registrationId: registered.registrationId });

  const timedOut = await fabric.execute({
    capability: { namespace: 'repository', operation: 'analyze' },
    payload: { kind: 'json', value: {} },
    deadline: Date.now() + 5
  });
  assert.equal(timedOut.outcome, FABRIC_EXECUTION_OUTCOME.TIMED_OUT);
  assert.equal(timedOut.failure, FABRIC_FAILURE_KIND.TIMEOUT);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 1);
  const cancelled = await fabric.execute({
    capability: { namespace: 'repository', operation: 'analyze' },
    signal: controller.signal
  });
  assert.equal(cancelled.outcome, FABRIC_EXECUTION_OUTCOME.CANCELLED);
  assert.equal(cancelled.failure, FABRIC_FAILURE_KIND.CANCELLED);
});

test('fabric reconcile detects missing and stale registrations', () => {
  const fabric = createFabric();
  const reg = fabric.register({
    pluginId: 'reconcile-present',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce'
  });
  const stale = fabric.register({
    pluginId: 'reconcile-stale',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce'
  });
  fabric.markReady({ registrationId: reg.registrationId });
  fabric.markReady({ registrationId: stale.registrationId });

  const report = fabric.reconcile([{ pluginId: 'reconcile-present', state: 'Ready' }, { pluginId: 'reconcile-missing', state: 'Ready' }]);
  assert.equal(report.missing_from_fabric.length, 1);
  assert.equal(report.missing_from_fabric[0].pluginId, 'reconcile-missing');
  assert.equal(report.stale_registrations.some((entry) => entry.pluginId === 'reconcile-stale'), true);
});
