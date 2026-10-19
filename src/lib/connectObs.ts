import type { ObsBatchResult, ObsRequest, ObsRequestStatus } from '@/types/ObsRequest';
import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import {
  OBS_CLOSE_AUTHENTICATION_FAILED,
  OBS_OP_HELLO,
  OBS_OP_IDENTIFIED,
  OBS_OP_IDENTIFY,
  OBS_OP_REQUEST,
  OBS_OP_REQUEST_BATCH,
  OBS_OP_REQUEST_BATCH_RESPONSE,
  OBS_OP_REQUEST_RESPONSE,
  OBS_RPC_VERSION,
  REQUEST_BATCH_EXECUTION_SERIAL_FRAME,
} from '@/constants/obsWebSocket';
import { authenticationResponse } from '@/lib/obsAuthentication';

/** The slice of the WebSocket API the client uses, so tests can hand in a scripted socket. */
export interface ObsSocket {
  send: (data: string) => void;
  close: () => void;
  addEventListener: ((type: 'close', listener: (event: { code: number; reason: string }) => void) => void) &
    ((type: 'error', listener: () => void) => void) &
    ((type: 'message', listener: (event: { data: unknown }) => void) => void);
}

export interface ObsClient {
  /** Send one request and resolve with its response data, or reject with the request status. */
  call: (requestType: string, requestData?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Send a request batch and resolve with every result, failed ones included. */
  callBatch: (requests: ObsRequest[], executionType?: number) => Promise<ObsBatchResult[]>;
  close: () => void;
}

export interface ConnectObsOptions {
  /** How long to wait for OBS to answer the handshake or a request. */
  timeoutMs?: number;
  createSocket?: (url: string) => ObsSocket;
}

export type ConnectObs = (connection: ObsConnection, options?: ConnectObsOptions) => Promise<ObsClient>;

interface Pending {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
}

interface ObsMessage {
  op: number;
  d: Record<string, unknown>;
}

const defaultCreateSocket = (url: string) => new WebSocket(url) as unknown as ObsSocket;

const statusError = (requestType: string, status: ObsRequestStatus) =>
  new Error(`${requestType} failed: ${String(status.code)} ${status.comment ?? ''}`.trimEnd());

/**
 * Connect to obs-websocket v5 on the runtime's global WebSocket, identify, and resolve with a client. The connection
 * fails if OBS does not answer within the timeout, rejects the password, or closes before identifying.
 */
export const connectObs: ConnectObs = (connection, { timeoutMs = 8000, createSocket = defaultCreateSocket } = {}) =>
  new Promise<ObsClient>((resolveClient, rejectClient) => {
    const socket = createSocket(connection.url);
    const pending = new Map<string, Pending>();
    let nextId = 0;
    let identified = false;

    const timer = setTimeout(() => {
      socket.close();
      fail(new Error(`OBS did not answer within ${String(timeoutMs)} ms`));
    }, timeoutMs);

    const send = (op: number, d: unknown) => {
      socket.send(JSON.stringify({ op, d }));
    };

    /** Reject the connection or every request still in flight, whichever applies. */
    const fail = (error: Error) => {
      clearTimeout(timer);
      if (!identified) rejectClient(error);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };

    const request = <Result>(op: number, body: Record<string, unknown>) =>
      new Promise<Result>((resolve, reject) => {
        const requestId = String(nextId++);
        pending.set(requestId, { resolve, reject });
        send(op, { ...body, requestId });
      });

    const settle = (requestId: string) => {
      const entry = pending.get(requestId);
      pending.delete(requestId);
      return entry;
    };

    const client: ObsClient = {
      call: async (requestType, requestData = {}) => {
        const response = await request<{ requestStatus: ObsRequestStatus; responseData?: Record<string, unknown> }>(
          OBS_OP_REQUEST,
          { requestType, requestData },
        );
        if (!response.requestStatus.result) throw statusError(requestType, response.requestStatus);
        return response.responseData ?? {};
      },
      callBatch: async (requests, executionType = REQUEST_BATCH_EXECUTION_SERIAL_FRAME) => {
        const response = await request<{ results: ObsBatchResult[] }>(OBS_OP_REQUEST_BATCH, {
          haltOnFailure: false,
          executionType,
          requests,
        });
        return response.results;
      },
      close: () => {
        socket.close();
      },
    };

    socket.addEventListener('error', () => {
      fail(new Error(`could not connect to OBS at ${connection.url}`));
    });
    socket.addEventListener('close', (event) => {
      fail(
        event.code === OBS_CLOSE_AUTHENTICATION_FAILED
          ? new Error('OBS rejected the websocket password')
          : new Error(`OBS closed the connection: ${String(event.code)} ${event.reason}`.trimEnd()),
      );
    });
    socket.addEventListener('message', (event) => {
      const { op, d } = JSON.parse(String(event.data)) as ObsMessage;
      switch (op) {
        case OBS_OP_HELLO: {
          const authentication = d.authentication as undefined | { challenge: string; salt: string };
          send(OBS_OP_IDENTIFY, {
            rpcVersion: OBS_RPC_VERSION,
            ...(authentication
              ? {
                  authentication: authenticationResponse(
                    connection.password,
                    authentication.salt,
                    authentication.challenge,
                  ),
                }
              : {}),
          });
          break;
        }
        case OBS_OP_IDENTIFIED: {
          identified = true;
          clearTimeout(timer);
          resolveClient(client);
          break;
        }
        case OBS_OP_REQUEST_BATCH_RESPONSE:
        case OBS_OP_REQUEST_RESPONSE: {
          settle(d.requestId as string)?.resolve(d as never);
          break;
        }
        // Events and anything else are not used
      }
    });
  });

/** Connection details from the config's `obs` field over Firebot's OBS integration settings. */
export type ObsConnectionSource = Pick<ScenesConfig, 'obs'>;
