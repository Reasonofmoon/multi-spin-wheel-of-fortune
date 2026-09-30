# ADR 0002: Client-side commit–reveal with rejection sampling

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

The app must remain static-hosted and each result must be independently replayable. A single-device host remains able to alter the client, so a client-side protocol cannot establish trust against a malicious host. The draw mapping also must not introduce modulo bias, including for seven equal segments.

## Decision

Generate a 32-byte server seed with Web Crypto, publish its SHA-256 commitment before draws, and accept an editable client seed. Per draw, sign the exact UTF-8 message `${clientSeed}:${nonce}:${wheelId}` with HMAC-SHA-256. Map the 256-bit digest with rejection sampling; a rejected digest is deterministically expanded from the original digest and an attempt counter. Store the full segment snapshot and draw evidence for later replay by a separate verifier page.

## Consequences

- The protocol is deterministic after both seeds are known and uses Web Crypto only; it has no `Math.random` fallback.
- The verifier can detect inconsistent exported logs offline when its static files are available, but the static deployment does not provide a trusted timestamp, server, or independent witness.
- The server seed must remain private in the host's session state until reveal; a later UI/state milestone must ensure that it is not shown early.
- Rejection sampling is exact for an ideal uniform 256-bit digest and avoids `% W` bias; cryptographic security still relies on Web Crypto, HMAC-SHA-256, and SHA-256.
