import crypto from 'crypto';

import { asUTF8, toHEX } from './buffer';
import type { Algorithms, TypedArray } from './crypto.d';

export function digest(algo: Algorithms.Digest, message: string): Promise<string> {
	return crypto.subtle.digest(algo, asUTF8(message)).then(toHEX);
}

export const MD5    = /*#__PURE__*/ digest.bind(0, 'MD5');
export const SHA1   = /*#__PURE__*/ digest.bind(0, 'SHA-1');
export const SHA256 = /*#__PURE__*/ digest.bind(0, 'SHA-256');
export const SHA384 = /*#__PURE__*/ digest.bind(0, 'SHA-384');
export const SHA512 = /*#__PURE__*/ digest.bind(0, 'SHA-512');

export function keyload(algo: Algorithms.Keying, secret: string, scopes: KeyUsage[]): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', asUTF8(secret), algo, false, scopes);
}

export function keygen(algo: Algorithms.Keying, scopes: KeyUsage[], extractable = false): Promise<CryptoKey|CryptoKeyPair> {
	return crypto.subtle.generateKey(algo, extractable, scopes);
}

export function sign(algo: Algorithms.Signing, key: CryptoKey, payload: string): Promise<ArrayBuffer> {
	return crypto.subtle.sign(algo, key, asUTF8(payload));
}

export function verify(algo: Algorithms.Signing, key: CryptoKey, payload: string, signature: ArrayBuffer): Promise<boolean> {
	return crypto.subtle.verify(algo, key, signature, asUTF8(payload));
}

export function timingSafeEqual<T extends TypedArray>(a: T, b: T): boolean {
	if (a.byteLength !== b.byteLength) return false;
	let len = a.length, different = false;
	while (len-- > 0) {
		// must check all items until complete
		if (a[len] !== b[len]) different = true;
	}
	return !different;
}

export async function PBKDF2(digest: Algorithms.Digest, password: string, salt: string, iters: number, length: number): Promise<ArrayBuffer> {
	const key = await keyload('PBKDF2', password, ['deriveBits']);

	const algo: Pbkdf2Params = {
		name: 'PBKDF2',
		salt: asUTF8(salt),
		iterations: iters,
		hash: digest,
	};

	return crypto.subtle.deriveBits(algo, key, length << 3);
}

export function HMAC(hash: Algorithms.Digest, secret: string, data: string): Promise<ArrayBuffer> {
	return keyload({ name: 'HMAC', hash }, secret, ['sign']).then(key => sign('HMAC', key, data));
}

export const HMAC256 = /*#__PURE__*/ HMAC.bind(0, 'SHA-256');
export const HMAC384 = /*#__PURE__*/ HMAC.bind(0, 'SHA-384');
export const HMAC512 = /*#__PURE__*/ HMAC.bind(0, 'SHA-512');
