const crypto = require('node:crypto');

const BUZZ_PINNED_COMMIT = 'ac4fa13b8e4d947071d57deb6918dcf12bf74961';

const ROOM_STATUSES = new Set(['creating', 'active', 'paused', 'verifying', 'completed', 'archived']);
const PARTICIPANT_STATUSES = new Set(['invited', 'active', 'idle', 'working', 'waiting', 'disconnected', 'removed']);
const CONTRIBUTION_KINDS = new Set([
  'observation',
  'question',
  'recommendation',
  'proposal',
  'challenge',
  'decision',
  'implementation-update',
  'evidence',
  'risk',
  'uncertainty',
  'completion-opinion'
]);

const DEFAULT_ADVISORY_SCOPE = {
  change: true,
  intent: true,
  plan: true,
  repositoryContext: { enabled: true },
  interventions: true,
  evidence: true,
  implementationEvents: true,
  participantMessages: true
};

const DEFAULT_CONTEXT_POLICY = {
  boundary: 'change-room',
  detail: 'focused'
};

class BuzzAdapter {
  constructor({ repositoryId, repositoryPath }) {
    this.repositoryId = repositoryId;
    this.repositoryPath = repositoryPath;
    this.roomsById = new Map();
    this.roomIdByChangeSessionId = new Map();
  }

  createOrAttachRoom(changeSessionId) {
    const existing = this.getRoomByChangeSessionId(changeSessionId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const roomId = `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const room = {
      id: roomId,
      changeSessionId,
      buzzRoomId: roomId,
      repository: {
        id: this.repositoryId,
        path: this.repositoryPath
      },
      status: 'active',
      participants: [],
      contributions: [],
      buzz: {
        dependency: {
          repository: 'https://github.com/block/buzz.git',
          pinnedCommit: BUZZ_PINNED_COMMIT
        }
      },
      createdAt: now,
      updatedAt: now
    };

    this.roomsById.set(roomId, room);
    this.roomIdByChangeSessionId.set(changeSessionId, roomId);
    return room;
  }

  getRoomByChangeSessionId(changeSessionId) {
    const roomId = this.roomIdByChangeSessionId.get(changeSessionId);
    return roomId ? this.roomsById.get(roomId) || null : null;
  }

  getRoom(roomId) {
    return this.roomsById.get(roomId) || null;
  }

  setRoomStatus(roomId, status) {
    const room = this.getRoom(roomId);
    if (!room || !ROOM_STATUSES.has(status)) return room;
    room.status = status;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  upsertParticipant(roomId, input = {}) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const now = new Date().toISOString();
    const id = input.id || `participant_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const existing = room.participants.find((participant) => participant.id === id);
    const status = PARTICIPANT_STATUSES.has(input.status) ? input.status : 'active';

    const participant = existing || {
      id,
      roomId: room.id,
      identity: {},
      role: 'custom',
      capabilities: [],
      advisoryScope: DEFAULT_ADVISORY_SCOPE,
      contextPolicy: DEFAULT_CONTEXT_POLICY,
      status: 'invited',
      joinedAt: now
    };

    participant.identity = {
      type: input.identity?.type || participant.identity.type || 'service',
      name: input.identity?.name || participant.identity.name || id,
      provider: input.identity?.provider || participant.identity.provider,
      instanceId: input.identity?.instanceId || participant.identity.instanceId
    };
    participant.role = input.role || participant.role || 'custom';
    participant.capabilities = Array.isArray(input.capabilities) ? Array.from(new Set(input.capabilities.filter(Boolean))) : participant.capabilities;
    participant.advisoryScope = mergeScopes(participant.advisoryScope, input.advisoryScope);
    participant.contextPolicy = { ...participant.contextPolicy, ...(input.contextPolicy || {}) };
    participant.status = status;
    participant.lastActiveAt = now;
    if (!existing) room.participants.push(participant);
    room.updatedAt = now;
    return participant;
  }

  listParticipants(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.participants : null;
  }

  publishContribution(roomId, input = {}) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const participant = room.participants.find((entry) => entry.id === input.participantId);
    if (!participant) return null;

    const now = new Date().toISOString();
    const kind = CONTRIBUTION_KINDS.has(input.kind) ? input.kind : 'observation';
    const contribution = {
      id: input.id || `contribution_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      roomId: room.id,
      participantId: participant.id,
      kind,
      subject: {
        type: input.subject?.type || 'change',
        id: input.subject?.id,
        path: input.subject?.path
      },
      content: {
        summary: String(input.content?.summary || '').trim(),
        details: input.content?.details,
        structured: input.content?.structured || undefined
      },
      confidence: Number.isFinite(input.confidence) ? Number(input.confidence) : undefined,
      uncertainty: input.uncertainty || undefined,
      evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : [],
      status: input.status || 'published',
      createdAt: now,
      updatedAt: now
    };

    if (!contribution.content.summary) return null;
    room.contributions.push(contribution);
    room.updatedAt = now;
    participant.lastActiveAt = now;
    return contribution;
  }

  listContributions(roomId, options = {}) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const kind = options.kind ? String(options.kind) : null;
    return kind ? room.contributions.filter((entry) => entry.kind === kind) : room.contributions;
  }
}

function mergeScopes(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return current || DEFAULT_ADVISORY_SCOPE;
  return {
    ...DEFAULT_ADVISORY_SCOPE,
    ...(current || {}),
    ...incoming,
    repositoryContext: {
      ...DEFAULT_ADVISORY_SCOPE.repositoryContext,
      ...(current?.repositoryContext || {}),
      ...(incoming.repositoryContext || {})
    }
  };
}

module.exports = {
  BUZZ_PINNED_COMMIT,
  BuzzAdapter
};
