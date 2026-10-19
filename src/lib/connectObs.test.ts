import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectObs, type ObsSocket } from '@/lib/connectObs';
import { authenticationResponse } from '@/lib/obsAuthentication';

interface Sent {
  op: number;
  d: Record<string, unknown>;
}

/** A scripted socket: records what the client sends and lets a test push messages, errors, and closes. */
class FakeSocket implements ObsSocket {
  closed = false;
  sent: Sent[] = [];
  private listeners: Record<string, ((event: never) => void)[]> = {};

  constructor(public url: string) {}

  addEventListener(type: string, listener: (event: never) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners[type] ?? []) listener(event as never);
  }

  receive(op: number, d: unknown) {
    this.emit('message', { data: JSON.stringify({ op, d }) });
  }

  /** Answer the last request the client sent. */
  respond(op: number, d: Record<string, unknown>) {
    const last = this.sent.at(-1);
    this.receive(op, { ...d, requestId: last?.d.requestId });
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Sent);
  }
}

let socket: FakeSocket;
const createSocket = (url: string) => {
  socket = new FakeSocket(url);
  return socket;
};
/** Stands in for the global WebSocket constructor; `new` on it yields the fake socket. */
function StubWebSocket(url: string) {
  return createSocket(url);
}
const connection = { url: 'ws://obs:4455', password: 'pw' };

const connect = () => {
  const pending = connectObs(connection, { createSocket, timeoutMs: 1000 });
  socket.receive(0, { authentication: { challenge: 'c', salt: 's' } });
  socket.receive(2, {});
  return pending;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('connectObs', () => {
  it('identifies with the authentication answer when OBS asks for one', async () => {
    await connect();

    expect(socket.url).toBe('ws://obs:4455');
    expect(socket.sent).toEqual([
      { op: 1, d: { rpcVersion: 1, authentication: authenticationResponse('pw', 's', 'c') } },
    ]);
  });

  it('identifies without authentication when OBS has none', async () => {
    const pending = connectObs(connection, { createSocket });
    socket.receive(0, {});
    socket.receive(2, {});
    await pending;

    expect(socket.sent).toEqual([{ op: 1, d: { rpcVersion: 1 } }]);
  });

  it('sends a request and resolves with its response data', async () => {
    const client = await connect();
    const call = client.call('GetVersion');
    socket.respond(7, {
      requestType: 'GetVersion',
      requestStatus: { result: true, code: 100 },
      responseData: { obsVersion: '32' },
    });

    await expect(call).resolves.toEqual({ obsVersion: '32' });
    expect(socket.sent.at(-1)).toEqual({ op: 6, d: { requestType: 'GetVersion', requestData: {}, requestId: '0' } });
  });

  it('resolves with an empty object when a response has no data', async () => {
    const client = await connect();
    const call = client.call('Sleep', { sleepMillis: 1 });
    socket.respond(7, { requestType: 'Sleep', requestStatus: { result: true, code: 100 } });

    await expect(call).resolves.toEqual({});
  });

  it('rejects a request OBS refuses, with its status', async () => {
    const client = await connect();
    const call = client.call('GetSceneItemId', { sceneName: 'x' });
    socket.respond(7, {
      requestType: 'GetSceneItemId',
      requestStatus: { result: false, code: 600, comment: 'No source' },
    });

    await expect(call).rejects.toThrow('GetSceneItemId failed: 600 No source');

    const terse = client.call('GetVersion');
    socket.respond(7, { requestType: 'GetVersion', requestStatus: { result: false, code: 207 } });

    await expect(terse).rejects.toThrow('GetVersion failed: 207');
  });

  it('sends a frame-synced batch by default and resolves with every result', async () => {
    const client = await connect();
    const requests = [{ requestType: 'Sleep', requestData: { sleepFrames: 2 } }];
    const batch = client.callBatch(requests);
    const results = [{ requestType: 'Sleep', requestStatus: { result: true, code: 100 } }];
    socket.respond(9, { results });

    await expect(batch).resolves.toEqual(results);
    expect(socket.sent.at(-1)).toEqual({
      op: 8,
      d: { haltOnFailure: false, executionType: 1, requests, requestId: '0' },
    });
  });

  it('passes an explicit batch execution type through', async () => {
    const client = await connect();
    const batch = client.callBatch([], 0);
    socket.respond(9, { results: [] });

    await expect(batch).resolves.toEqual([]);
    expect(socket.sent.at(-1)?.d.executionType).toBe(0);
  });

  it('ignores events and responses it did not ask for', async () => {
    const client = await connect();
    socket.receive(5, { eventType: 'SceneItemTransformChanged' });
    socket.receive(7, { requestId: 'stranger', requestStatus: { result: true, code: 100 } });
    const call = client.call('GetVersion');
    socket.respond(7, { requestStatus: { result: true, code: 100 }, responseData: { ok: true } });

    await expect(call).resolves.toEqual({ ok: true });
  });

  it("opens the runtime's global WebSocket when no socket factory is given", async () => {
    vi.stubGlobal('WebSocket', StubWebSocket);
    try {
      const pending = connectObs(connection);
      socket.receive(0, {});
      socket.receive(2, {});

      await expect(pending).resolves.toBeDefined();
      expect(socket.url).toBe('ws://obs:4455');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('closes the socket on close()', async () => {
    const client = await connect();
    client.close();

    expect(socket.closed).toBe(true);
  });

  it('rejects the connection when the password is wrong', async () => {
    const pending = connectObs(connection, { createSocket });
    socket.emit('close', { code: 4009, reason: 'Authentication failed.' });

    await expect(pending).rejects.toThrow('OBS rejected the websocket password');
  });

  it('rejects the connection when the socket errors or closes early', async () => {
    const errored = connectObs(connection, { createSocket });
    socket.emit('error', undefined);
    await expect(errored).rejects.toThrow('could not connect to OBS at ws://obs:4455');

    const closed = connectObs(connection, { createSocket });
    socket.emit('close', { code: 1006, reason: '' });
    await expect(closed).rejects.toThrow('OBS closed the connection: 1006');
  });

  it('rejects the connection when OBS never answers', async () => {
    const pending = connectObs(connection, { createSocket, timeoutMs: 50 });
    vi.advanceTimersByTime(50);

    await expect(pending).rejects.toThrow('OBS did not answer within 50 ms');
    expect(socket.closed).toBe(true);
  });

  it('fails requests in flight when the connection drops', async () => {
    const client = await connect();
    const call = client.call('GetVersion');
    socket.emit('close', { code: 1006, reason: 'gone' });

    await expect(call).rejects.toThrow('OBS closed the connection: 1006 gone');
  });
});
