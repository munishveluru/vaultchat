/**
 * VaultChat — E2E Encryption Module
 * Uses Web Crypto API for real RSA-OAEP + AES-256-GCM encryption.
 * Private keys never leave the client.
 */
class VaultCrypto {
  constructor() {
    this.keyPair = null;
    this.publicKeyPem = null;
    this.privateKey = null;
    this.publicKey = null;
  }

  /** Generate RSA-OAEP 2048-bit key pair */
  async generateKeyPair() {
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );
    this.publicKey = this.keyPair.publicKey;
    this.privateKey = this.keyPair.privateKey;

    const exported = await crypto.subtle.exportKey('spki', this.publicKey);
    this.publicKeyPem = this._arrayBufferToBase64(exported);
    return this.publicKeyPem;
  }

  /** Import a recipient's public key from base64 */
  async importPublicKey(base64Key) {
    const binary = this._base64ToArrayBuffer(base64Key);
    return crypto.subtle.importKey('spki', binary, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
  }

  /** Encrypt a message for a recipient */
  async encryptMessage(plaintext, recipientPublicKey) {
    // Generate random AES-256 key for this message
    const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the message with AES-GCM
    const encoded = new TextEncoder().encode(plaintext);
    const encryptedMessage = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);

    // Export and encrypt the AES key with recipient's RSA public key
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
    const pubKey = typeof recipientPublicKey === 'string' ? await this.importPublicKey(recipientPublicKey) : recipientPublicKey;
    const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAesKey);

    return {
      encryptedMessage: this._arrayBufferToBase64(encryptedMessage),
      encryptedKey: this._arrayBufferToBase64(encryptedKey),
      iv: this._arrayBufferToBase64(iv)
    };
  }

  /** Decrypt a message using our private key */
  async decryptMessage(encryptedMessage, encryptedKey, iv) {
    // Decrypt the AES key with our RSA private key
    const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, this.privateKey, this._base64ToArrayBuffer(encryptedKey));

    // Import the AES key
    const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

    // Decrypt the message
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this._base64ToArrayBuffer(iv) },
      aesKey,
      this._base64ToArrayBuffer(encryptedMessage)
    );

    return new TextDecoder().decode(decrypted);
  }

  /** Generate a short fingerprint from a public key */
  async getFingerprint(publicKeyBase64) {
    const data = this._base64ToArrayBuffer(publicKeyBase64);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.match(/.{1,4}/g).slice(0, 8).join(' ').toUpperCase();
  }

  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  _base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}

window.VaultCrypto = VaultCrypto;
