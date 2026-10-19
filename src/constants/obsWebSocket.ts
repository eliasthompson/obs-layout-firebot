// obs-websocket protocol v5 message opcodes and values

/** Where obs-websocket listens out of the box, with authentication off. */
export const DEFAULT_OBS_URL = 'ws://localhost:4455';
export const DEFAULT_OBS_PASSWORD = '';

export const OBS_RPC_VERSION = 1;

export const OBS_OP_HELLO = 0;
export const OBS_OP_IDENTIFY = 1;
export const OBS_OP_IDENTIFIED = 2;
export const OBS_OP_REQUEST = 6;
export const OBS_OP_REQUEST_RESPONSE = 7;
export const OBS_OP_REQUEST_BATCH = 8;
export const OBS_OP_REQUEST_BATCH_RESPONSE = 9;

/** Runs a batch as fast as possible, for reads that need no frame sync. */
export const REQUEST_BATCH_EXECUTION_SERIAL_REALTIME = 0;
/** Runs a batch in sync with OBS's video frames; `Sleep` requests inside it count frames. */
export const REQUEST_BATCH_EXECUTION_SERIAL_FRAME = 1;

export const OBS_CLOSE_AUTHENTICATION_FAILED = 4009;
