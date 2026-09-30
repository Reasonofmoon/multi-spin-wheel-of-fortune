# Fairness protocol and threat model

## Protocol

This is a client-side, commit–reveal protocol. It makes each draw reproducible and avoids modulo bias; it does **not** make a host-controlled browser an impartial authority.

1. Before a draw, the app creates a 32-byte `serverSeed` with `crypto.getRandomValues`, selects or accepts an editable `clientSeed` (the default is also 32 random bytes), and displays `SHA-256(serverSeed)` as the commitment. The server seed stays in the host tab's session memory until the session is revealed/exported.
2. The app imports the 32-byte server seed as a non-extractable Web Crypto HMAC key. Draw `nonce` for `wheelId` signs the UTF-8 bytes of exactly:

   ```text
   ${clientSeed}:${nonce}:${wheelId}
   ```

   using HMAC-SHA-256.

3. Interpret the 32-byte digest as an unsigned big-endian integer `x`. For total weight `W`, calculate `L = 2^256 - (2^256 mod W)`. If `x < L`, the draw value is `x mod W`; otherwise it is rejected. A rejected digest is deterministically expanded as `SHA-256(originalDigest || uint64be(attempt))` and rejection sampling repeats. This retry expansion does not call a second random source and is reproducible by the verifier. The accepted integer is in `[0,W)` with no modulo bias under the usual SHA-256 pseudorandomness assumption.
4. Walk the wheel's positive integer weights in stable segment order and select the first interval containing the value. The app records the nonce, wheel identifier, exact segment id/label/weight snapshot, accepted value, HMAC, and selected id. Nonces are zero-based and advance once per draw across the session.
5. Once the session ends, the host reveals `serverSeed`. The exported version-1 session JSON includes the seed, commitment, client seed, and draw records. `/verify/` checks the seed commitment and independently recomputes each draw. A modified draw fails individually; an invalid commitment fails the session's draws.

Web Crypto is required. There is deliberately no `Math.random()` fallback: if cryptographic randomness or SHA-256/HMAC is unavailable, a session cannot start or verify successfully.

## Offline verifier

Open the static `/multi-spin-wheel-of-fortune/verify/` page, paste an exported session JSON or select the local file, and choose **검증하기**. The verifier is a separate Vite entry point; it imports only the domain verifier and its own stylesheet, does not read roulette state/localStorage, and sends no data over the network. This milestone has not yet added a service worker, so offline use is only possible if the browser already has the verifier page and its assets available; reliable post-install offline support remains an M5 item.

## Threat model

### Helps protect against

- Accidental or post-hoc changes to the revealed server seed: a changed seed will not match a commitment participants saw before the draw.
- A participant changing their client seed after a draw without detection: the recorded client seed is part of the HMAC message and is rechecked.
- Silent edits to a recorded outcome, weight snapshot, nonce, wheel id, or HMAC: verification recomputes those fields.
- Small-wheel modulo bias: rejection sampling discards the incomplete upper residue range rather than reducing every digest modulo the weight sum.

### Does not protect against

- A malicious host controlling the only device. The host can modify the JavaScript, choose or inspect seeds, show a false commitment, alter the participant list before committing, suppress or replace the log, clear browser data, or simply announce a different result. There is no independent server or trusted timestamp to prove which commitment was displayed first.
- A compromised browser, malicious extension, developer-tools user, or operating-system compromise that can read or alter tab memory and Web Crypto calls.
- Collusion or coercion among participants, dishonest roster entries, or disputes about the human meaning of labels and weights.
- Randomness if the browser's Web Crypto implementation is compromised. HMAC and SHA-256 are assumed secure; the verifier proves internal consistency, not that the host followed the protocol honestly.
- Availability. A host can close the tab before revealing the seed or exporting the log. A local commitment is not an external witness.

For a single-device classroom/party game, commit–reveal is useful evidence against casual silent rerolls, not a trustless fairness guarantee. For adversarial stakes, use an independent trusted randomness source or have multiple participants independently commit entropy and preserve the commitment/log outside the host's control.
