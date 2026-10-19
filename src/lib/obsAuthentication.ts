import { createHash } from 'node:crypto';

export const sha256Base64 = (text: string) => createHash('sha256').update(text).digest('base64');

/** The `authentication` string obs-websocket expects in Identify, from the Hello message's salt and challenge. */
export const authenticationResponse = (password: string, salt: string, challenge: string) =>
  sha256Base64(sha256Base64(password + salt) + challenge);
