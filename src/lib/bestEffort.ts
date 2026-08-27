// Vercel serverless functions don't guarantee an un-awaited promise survives past the HTTP
// response being sent — the function can freeze/tear down mid-flight, silently killing whatever
// was still in progress (confirmed 2026-08-25: production signup verification emails were being
// silently dropped this exact way, even though the SMTP send itself works perfectly when
// awaited). "Best-effort" (a transactional email, a Google Calendar sync, etc. that must never
// block or fail the caller's own operation) does NOT mean "don't await it" — it means "await it,
// but swallow and log any error instead of letting it propagate." Use this for every such call
// instead of the `somePromise().catch(err => console.error(...))` pattern, which looks
// equivalent locally but is NOT actually safe once deployed here.
export async function bestEffort(promise: Promise<unknown>, errorLabel: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    console.error(errorLabel, err);
  }
}
