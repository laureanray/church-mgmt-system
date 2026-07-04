import "server-only";

import { customAlphabet } from "nanoid";

// Unambiguous alphabet (no 0/O/1/l/I) so temporary passwords are easy to read
// aloud or copy from a screen.
const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const generate = customAlphabet(ALPHABET, 10);

/** Generate a readable one-time temporary password. */
export function generateTempPassword(): string {
  return generate();
}
