const TOKEN_BYTES = 16;

export function newId() {
  return crypto.randomUUID();
}

export function newToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
