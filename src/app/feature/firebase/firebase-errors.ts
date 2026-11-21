import { Service, inject } from '@angular/core';
import { UserService } from '@wawjs/ngx-bos';
import { TranslateService } from '@wawjs/ngx-translate';
import { AlertService } from '@wawjs/ngx-ui';

/** What kind of failure a Firebase error is, as far as the person needs to know. */
export type FirebaseErrorKind = 'permission-denied' | 'unavailable' | 'not-signed-in' | 'other';

/** The text shown for each kind (source language; translated when shown). */
export const FIREBASE_ERROR_TEXTS: Record<FirebaseErrorKind, string> = {
	'permission-denied': 'You do not have access to this',
	unavailable: 'No connection, try again',
	'not-signed-in': 'Please sign in again',
	other: 'Something went wrong',
};

const UNAVAILABLE = ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'];
const NOT_SIGNED_IN = ['not-signed-in', 'unauthenticated', 'auth/user-token-expired', 'auth/user-not-found'];

/** Sorts an error from Firestore, Firebase Auth or the stores (`Error('not-signed-in')`). */
export function firebaseErrorKind(error: unknown): FirebaseErrorKind {
	const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
	const key = typeof code === 'string' ? code : typeof message === 'string' ? message : '';

	if (key === 'permission-denied') return 'permission-denied';
	if (NOT_SIGNED_IN.includes(key)) return 'not-signed-in';
	if (UNAVAILABLE.includes(key)) return 'unavailable';
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'unavailable';

	return 'other';
}

/**
 * Shows a failed Firebase action to the person: a specific message for missing access, no connection or a
 * lost sign-in, the generic one otherwise. A lost Firebase sign-in (the API session may still exist) also
 * signs out, which clears the saved user and lands on the sign page.
 */
@Service()
export class FirebaseErrorService {
	private readonly _alertService = inject(AlertService);
	private readonly _translate = inject(TranslateService);
	private readonly _userService = inject(UserService);

	private _signingOut = false;

	/** Logs the error under `tag`, shows its message, and returns its kind. */
	report(error: unknown, tag: string): FirebaseErrorKind {
		console.error(tag, error);

		const kind = firebaseErrorKind(error);

		this._alertService.error({ text: this._translate.translate(FIREBASE_ERROR_TEXTS[kind])() });

		if (kind === 'not-signed-in' && !this._signingOut) {
			this._signingOut = true;
			this._userService.logout();
		}

		return kind;
	}
}
