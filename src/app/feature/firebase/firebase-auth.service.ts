import { Service, computed, signal } from '@angular/core';
import { environment } from '@env';

/** Firebase error codes that mean the person closed or replaced the popup, not a real failure. */
const CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

/**
 * Google sign-in through Firebase Authentication. The Firebase SDK is loaded on first use, so it only
 * downloads on the sign page. The app session itself still comes from the API: the Firebase ID token
 * is exchanged for it at `/api/user/firebase`.
 */
@Service()
export class FirebaseAuthService {
	/** The Firebase account that is signed in, or null. Filled in once `watch()` has run. */
	readonly user = signal<{ uid: string; email: string | null; name?: string | null } | null>(null);

	/**
	 * True when the signed-in Firebase account is listed in `environment.admins`. This only decides
	 * what the app shows; the real protection is the admin list in the Firestore rules.
	 */
	readonly isAdmin = computed(() => {
		const user = this.user();

		if (!user) return false;

		const email = user.email?.trim().toLowerCase() ?? '';

		return environment.admins.some(
			(admin) => admin.uid === user.uid || (!!email && admin.email.toLowerCase() === email),
		);
	});

	private _watching?: Promise<void>;
	private _sdk?: Promise<{
		app: import('firebase/app').FirebaseApp;
		auth: import('firebase/auth').Auth;
		provider: import('firebase/auth').GoogleAuthProvider;
		signInWithPopup: typeof import('firebase/auth').signInWithPopup;
	}>;
	private _ready?: Promise<void>;

	/** Loads Firebase and keeps `user` in step with the sign-in. Safe to call more than once. */
	watch(): Promise<void> {
		return (this._watching ??= this._load().then(async ({ auth }) => {
			const { onAuthStateChanged } = await import('firebase/auth');
			const set = (account: { uid: string; email: string | null; displayName?: string | null } | null) =>
				this.user.set(
					account ? { uid: account.uid, email: account.email, name: account.displayName ?? null } : null,
				);

			await auth.authStateReady();
			set(auth.currentUser);
			onAuthStateChanged(auth, set);
		}));
	}

	/**
	 * Loads the SDK ahead of the click and drops any Firebase session left over from an earlier visit.
	 * Loading early matters: browsers block a popup that opens too long after the click.
	 */
	prepare(): Promise<void> {
		return (this._ready ??= this._load().then(async ({ auth }) => {
			await auth.authStateReady();

			if (auth.currentUser) {
				await auth.signOut();
			}
		}));
	}

	/** Opens the Google popup. Resolves with a Firebase ID token, or null when the person closed it. */
	async signInWithGoogle(): Promise<string | null> {
		await this.prepare();

		const { auth, provider, signInWithPopup } = await this._load();

		try {
			const result = await signInWithPopup(auth, provider);

			return await result.user.getIdToken();
		} catch (error) {
			if (CANCELLED.includes((error as { code?: string }).code ?? '')) {
				return null;
			}

			throw error;
		}
	}

	/** Firestore, loaded on first use. */
	async firestore() {
		const { app } = await this._load();
		const fs = await import('firebase/firestore');

		return {
			db: fs.getFirestore(app, environment.firestoreDatabase),
			doc: fs.doc,
			getDoc: fs.getDoc,
			setDoc: fs.setDoc,
			collection: fs.collection,
			getDocs: fs.getDocs,
			addDoc: fs.addDoc,
			deleteDoc: fs.deleteDoc,
			query: fs.query,
			where: fs.where,
			orderBy: fs.orderBy,
			limit: fs.limit,
			startAfter: fs.startAfter,
			onSnapshot: fs.onSnapshot,
			updateDoc: fs.updateDoc,
		};
	}

	private _load() {
		return (this._sdk ??= (async () => {
			const [{ getApp, getApps, initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
				await Promise.all([import('firebase/app'), import('firebase/auth')]);

			const app = getApps().length ? getApp() : initializeApp(environment.firebase);
			const provider = new GoogleAuthProvider();

			// Always show the account chooser, so a shared computer does not sign in silently.
			provider.setCustomParameters({ prompt: 'select_account' });

			return { app, auth: getAuth(app), provider, signInWithPopup };
		})());
	}
}
