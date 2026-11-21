import { Service, effect, inject, signal } from '@angular/core';
import { LanguageService, Translate, TranslateService } from '@wawjs/ngx-translate';
import { FirebaseActivityService } from './firebase-activity.service';
import { FirebaseAuthService } from './firebase-auth.service';

/** One custom phrase in Firestore (`bosTranslations/<id>`): the source text and its text per language. */
export interface TranslationEntry {
	id: string;
	sourceText: string;
	translations: Record<string, string>;
}

const COLLECTION = 'bosTranslations';

/**
 * Custom translations kept in Firestore. They are laid over the translation files of the active
 * language, so a phrase added here replaces the file text, and a new phrase works like any other.
 * Everyone can read them; only the administrators in the Firestore rules can change them.
 */
@Service()
export class FirebaseTranslationsService {
	private readonly _auth = inject(FirebaseAuthService);
	private readonly _activity = inject(FirebaseActivityService);
	private readonly _translate = inject(TranslateService);
	private readonly _languageService = inject(LanguageService);

	readonly entries = signal<TranslationEntry[]>([]);
	readonly isLoaded = signal(false);

	private _loading?: Promise<void>;
	private _applyRun = 0;

	/** Texts of the translation files per language, before any custom text is laid over them. */
	private readonly _base = new Map<string, Translate[]>();

	constructor() {
		effect(() => {
			const entries = this.entries();
			const language = this._languageService.language();

			if (!this.isLoaded() || !language) return;

			void this._apply(language, entries);
		});
	}

	/** Reads all custom translations once. Safe to call again; failures leave the list empty. */
	load(): Promise<void> {
		return (this._loading ??= this._read()
			.catch(() => undefined)
			.then(() => this.isLoaded.set(true)));
	}

	async add(sourceText: string, translations: Record<string, string> = {}): Promise<void> {
		const text = sourceText.trim();

		if (!text) return;

		const existing = this.entries().find((entry) => entry.sourceText === text);

		// The phrase already has an entry: lay the new texts over it instead of adding a second one.
		if (existing) {
			await this.save({ ...existing, translations: { ...existing.translations, ...translations } });

			return;
		}

		const { db, collection, addDoc } = await this._auth.firestore();
		const ref = await addDoc(collection(db, COLLECTION), { sourceText: text, translations });

		void this._activity.record({ action: 'create', entity: 'translation', entityId: ref.id, title: text });

		this.entries.update((entries) => [...entries, { id: ref.id, sourceText: text, translations }]);
	}

	async save(entry: TranslationEntry): Promise<void> {
		const translations = Object.fromEntries(
			Object.entries(entry.translations).filter(([, text]) => text.trim()),
		);
		const { db, doc, updateDoc } = await this._auth.firestore();

		// Replaces the whole translations map (a cleared language is dropped), other fields stay.
		await updateDoc(doc(db, COLLECTION, entry.id), { sourceText: entry.sourceText, translations });

		void this._activity.record({
			action: 'update',
			entity: 'translation',
			entityId: entry.id,
			title: entry.sourceText,
		});

		this.entries.update((entries) =>
			entries.map((item) => (item.id === entry.id ? { ...entry, translations } : item)),
		);
	}

	async remove(id: string): Promise<void> {
		const { db, doc, deleteDoc } = await this._auth.firestore();

		const entry = this.entries().find((item) => item.id === id);

		await deleteDoc(doc(db, COLLECTION, id));

		if (entry) {
			void this._activity.record({ action: 'delete', entity: 'translation', entityId: id, title: entry.sourceText });
		}

		this.entries.update((entries) => entries.filter((entry) => entry.id !== id));
	}

	private async _read(): Promise<void> {
		await this._auth.watch();

		const { db, collection, getDocs } = await this._auth.firestore();
		const snapshot = await getDocs(collection(db, COLLECTION));
		const entries = snapshot.docs
			.map((item) => {
				const data = item.data() as Partial<TranslationEntry>;

				return {
					id: item.id,
					sourceText: typeof data.sourceText === 'string' ? data.sourceText : '',
					translations: data.translations && typeof data.translations === 'object' ? data.translations : {},
				};
			})
			.filter((entry) => entry.sourceText)
			.sort((a, b) => a.sourceText.localeCompare(b.sourceText));

		this.entries.set(entries);
	}

	/** The texts of the translation files for one language (every i18n folder), without custom texts. */
	async fileTexts(language: string): Promise<Map<string, string>> {
		return new Map((await this._fileTranslations(language)).map((item) => [item.sourceText, item.text]));
	}

	private async _fileTranslations(language: string): Promise<Translate[]> {
		let base = this._base.get(language);

		if (!base) {
			base = await this._translate.loadTranslations(language);
			this._base.set(language, base);
		}

		return base;
	}

	/** Lays the custom texts of one language over what the translation files gave for it. */
	private async _apply(language: string, entries: TranslationEntry[]): Promise<void> {
		const run = ++this._applyRun;
		const base = await this._fileTranslations(language);

		// A newer change (another language, another edit) started while the files were loading.
		if (run !== this._applyRun) return;

		const merged = new Map<string, string>(base.map((item) => [item.sourceText, item.text]));

		for (const entry of entries) {
			const text = entry.translations[language];

			if (text) merged.set(entry.sourceText, text);
		}

		const translations: Translate[] = [...merged].map(([sourceText, text]) => ({ sourceText, text }));

		this._translate.setMany(translations);

		// `TranslateService.setLanguage()` applies the file texts after its own awaits, so on a switch back
		// to a loaded language it can land after the line above and hide the custom texts. Apply once more
		// after it had its turn, unless a newer change started meanwhile.
		await new Promise<void>((resolve) => setTimeout(resolve));

		if (run !== this._applyRun || this._languageService.language() !== language) return;

		this._translate.setMany(translations);
	}
}
