/**
 * @deprecated  This file is dead code retained only to avoid breaking the
 * legacy oauth.ts import.  All authentication is now handled by the custom
 * JWT system in server/auth/helpers.ts and server/_core/context.ts.
 *
 * Do NOT use any exports from this file in new code.
 */

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

class SDKServer {
  /**
   * @deprecated  Use verifySessionJwt() from server/auth/helpers.ts instead.
   */
  async authenticateRequest(_req: unknown): Promise<never> {
    throw new Error(
      "[SDK] authenticateRequest is deprecated. Use the custom JWT auth system."
    );
  }
}

export const sdk = new SDKServer();
