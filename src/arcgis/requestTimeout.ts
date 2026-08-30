/**
 * Combine a caller-provided abort signal (used to cancel superseded
 * requests) with a hard timeout, so a slow or unresponsive public service
 * can't hang a search or query forever (IMPLEMENTATION_PLAN.md section 5).
 */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
