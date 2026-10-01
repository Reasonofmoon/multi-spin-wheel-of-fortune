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
4. Walk the wheel's positive integer weights in stable segment order and select the first interval containing the value. The domain function returns the nonce, wheel identifier, exact segment id/label/weight snapshot, accepted value, HMAC, and selected id. Nonces are zero-based and must advance once per draw across the session. Participant and penalty draws use distinct nonces and wheel IDs, never a participant-index lookup.
5. Once the session ends, the host reveals `serverSeed`. A version-1 proof JSON contains the seed, commitment, **fixed session client seed**, and draw records. `/verify/` checks the seed commitment and independently recomputes each supplied draw, including consecutive nonces from zero. An inconsistent outcome/HMAC fails individually; an invalid commitment fails the session's draws. A client seed cannot change after drawing in a version-1 session.

**Implementation boundary at M2:** the domain returns and verifies these records; the inherited UI still does not durably record/export them. Event-sourced persistence and the actual export/import interface are M4 work. Do not interpret the inherited screen's label-only results as a durable proof. Unit verification uses real Node Web Crypto with an independent `node:crypto` HMAC/SHA-256 oracle, not mocks of the draw or verifier.

Web Crypto is required. There is deliberately no `Math.random()` fallback: if cryptographic randomness or SHA-256/HMAC is unavailable, a session cannot start or verify successfully.

## Offline verifier

Open the static `/multi-spin-wheel-of-fortune/verify/` page, paste an exported session JSON or select the local file, and choose **검증하기**. The verifier is a separate Vite entry point; it imports only the domain verifier and its own stylesheet, does not read roulette state/localStorage, and sends no data over the network. This milestone has not yet added a service worker, so offline use is only possible if the browser already has the verifier page and its assets available; reliable post-install offline support remains an M5 item.

## Threat model

### Helps protect against

- Accidental or post-hoc changes to the revealed server seed: a changed seed will not match a commitment participants saw before the draw.
- A participant changing their client seed after a draw without detection: the recorded client seed is part of the HMAC message and is rechecked.
- Internally inconsistent recorded outcomes, nonces, wheel IDs, accepted values, or HMACs: verification recomputes the supplied draws. This does not authenticate the roster snapshot or prove log completeness.
- Small-wheel modulo bias: rejection sampling discards the incomplete upper residue range rather than reducing every digest modulo the weight sum.

### Does not protect against

- A malicious host controlling the only device. The host can modify the JavaScript, choose or inspect seeds, show a false commitment, alter the participant list before committing, suppress or replace the log, clear browser data, or simply announce a different result. There is no independent server or trusted timestamp to prove which commitment was displayed first.
- A compromised browser, malicious extension, developer-tools user, or operating-system compromise that can read or alter tab memory and Web Crypto calls.
- Collusion or coercion among participants, dishonest roster entries, or disputes about the human meaning of labels and weights.
- Randomness if the browser's Web Crypto implementation is compromised. HMAC and SHA-256 are assumed secure; the verifier proves internal consistency, not that the host followed the protocol honestly.
- Availability. A host can close the tab before revealing the seed or exporting the log. A local commitment is not an external witness.
- Authenticity/completeness of the supplied roster and log. The HMAC message does not include labels or a roster commitment. Changing a label leaves a valid HMAC unchanged; some weight edits can map to the same outcome. Removing trailing draws can resemble an honestly shorter session. Internal event-log consistency and explicit voids help with accidental/silent app rerolls, but external observers must preserve commitments/configuration/logs to witness what actually happened.

For a single-device classroom/party game, commit–reveal is useful evidence against casual silent rerolls, not a trustless fairness guarantee. For adversarial stakes, use an independent trusted randomness source or have multiple participants independently commit entropy and preserve the commitment/log outside the host's control.
