import { Service, effect, inject, signal, untracked } from '@angular/core';
import { UserService } from '@wawjs/ngx-bos';
import { ThemeService } from '@wawjs/ngx-ui';
import { LanguageService, TranslateService } from '@wawjs/ngx-translate';
import { FirebaseAuthService } from './firebase-auth.service';

/** What is kept per person in Firestore, in `bosProfiles/<uid>`. */
export interface BosProfile {
	/** Who the person is, written at sign-in so admins can pick them (see the employees page). */
	uid?: string;
	email?: string;
	displayName?: string;
	name?: string;
	phone?: string;
	bio?: string;
	thumb?: string;
	mode?: string;
	density?: string;
	radius?: string;
	language?: string;
}

const COLLECTION = 'bosProfiles';

/**
 * The profile and settings of the signed-in person, kept in Firestore. After sign-in the saved values
 * are applied to the app; after that, changes to the theme and language are saved as they happen.
 * Failures (offline, rules) are ignored: the app keeps working with what it has locally.
 */
@Service()
export class FirebaseProfileService {
	private readonly _auth = inject(FirebaseAuthService);
	private readonly _userService = inject(UserService);
	private readonly _theme = inject(ThemeService);
	private readonly _languageService = inject(LanguageService);
	private readonly _translate = inject(TranslateService);

	private _loaded?: Promise<void>;
	private readonly _applied = signal(false);
	private _lastSettings = '';

	/** The Firebase uid the current load is for (null: no one); undefined until a load knows it. */
	private _loadedUid?: string | null;
	private _loadRun = 0;

	constructor() {
		effect(() => {
			const settings = this._settings();

			if (!this._applied() || !settings.language) return;

			const json = JSON.stringify(settings);

			if (json === this._lastSettings) return;

			this._lastSettings = json;
			this.save(settings).catch(() => undefined);
		});

		// The first load can run on /sign before anyone is signed in: load again when the person changes.
		effect(() => {
			const uid = this._auth.user()?.uid ?? null;

			if (this._loadedUid === undefined || uid === this._loadedUid) return;

			untracked(() => {
				this._loaded = undefined;
				this._applied.set(false);
				void this.load();
			});
		});
	}

	/** Resolves once the saved profile was read and applied (also when there is none). */
	loaded(): Promise<void> {
		return this._loaded ?? Promise.resolve();
	}

	/**
	 * Reads the saved profile once the Firebase sign-in is known, and applies it. Safe to call again.
	 * It runs again by itself when another person signs in.
	 */
	load(): Promise<void> {
		if (this._loaded) return this._loaded;

		const run = ++this._loadRun;
		const stale = () => run !== this._loadRun;

		return (this._loaded = this._auth
			.watch()
			.then(async () => {
				if (stale()) return;

				this._loadedUid = this._auth.user()?.uid ?? null;

				const saved = await this.read();

				if (stale()) return;

				await this._apply(saved);

				if (stale()) return;

				await this._saveIdentity();
			})
			.catch(() => undefined)
			.then(() => {
				// A newer load (another person signed in meanwhile) finishes the job.
				if (stale()) return;

				this._lastSettings = JSON.stringify(this._settings());
				this._applied.set(true);
			}));
	}

	async read(): Promise<BosProfile | null> {
		const uid = this._auth.user()?.uid;

		if (!uid) return null;

		const { db, doc, getDoc } = await this._auth.firestore();
		const snapshot = await getDoc(doc(db, COLLECTION, uid));

		return snapshot.exists() ? (snapshot.data() as BosProfile) : null;
	}

	/** Saves some fields; the others stay as they are. Does nothing when no one is signed in. */
	async save(fields: BosProfile): Promise<void> {
		const uid = this._auth.user()?.uid;

		if (!uid) return;

		const { db, doc, setDoc } = await this._auth.firestore();

		await setDoc(doc(db, COLLECTION, uid), fields, { merge: true });
	}

	/** Keeps who the person is next to their settings; the employees page lists signed users from this. */
	private async _saveIdentity(): Promise<void> {
		const user = this._auth.user();

		if (!user) return;

		await this.save({
			uid: user.uid,
			...(user.email && { email: user.email }),
			...(user.name && { displayName: user.name }),
		});
	}

	private _settings() {
		return {
			mode: this._theme.mode(),
			density: this._theme.density(),
			radius: this._theme.radius(),
			language: this._languageService.language(),
		};
	}

	private async _apply(saved: BosProfile | null): Promise<void> {
		if (!saved) return;

		if (saved.mode) this._theme.setMode(saved.mode as never);
		if (saved.density) this._theme.setDensity(saved.density as never);
		if (saved.radius) this._theme.setRadius(saved.radius as never);

		if (saved.language && saved.language !== this._languageService.language()) {
			await this._translate.setLanguage(saved.language);
		}

		const user = this._userService.user();

		if (user?._id) {
			this._userService.user.set({
				...user,
				...(saved.name !== undefined && { name: saved.name }),
				...(saved.phone !== undefined && { phone: saved.phone }),
				...(saved.bio !== undefined && { bio: saved.bio }),
				...(saved.thumb && { thumb: saved.thumb }),
			});
		}
	}
}
