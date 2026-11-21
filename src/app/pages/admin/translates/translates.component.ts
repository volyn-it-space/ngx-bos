import { Component, computed, inject, signal } from '@angular/core';
import { FormInterface, FormService } from '@wawjs/ngx-form';
import { LanguageService, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, TableComponent } from '@wawjs/ngx-ui';
import {
	FirebaseTranslationsService,
	TranslationEntry,
} from '../../../feature/firebase/firebase-translations.service';
import { FirebaseErrorService } from '../../../feature/firebase/firebase-errors';

/** A table row: the source text and one column per language. */
type Row = { id: string; sourceText: string } & Record<string, string>;

@Component({
	imports: [TableComponent],
	templateUrl: './translates.component.html',
})
export class TranslatesComponent {
	private readonly _store = inject(FirebaseTranslationsService);
	private readonly _formService = inject(FormService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	private readonly _languages = inject(LanguageService).languages();

	readonly columns = ['sourceText', ...this._languages.map((language) => language.code)];

	readonly rows = computed<Row[]>(() =>
		this._store.entries().map((entry) => ({
			id: entry.id,
			sourceText: entry.sourceText,
			...entry.translations,
		})),
	);

	readonly failed = signal(false);

	readonly config = {
		allDocs: true,
		perPage: 50,
		page: 1,
		searchBy: 'sourceText',
		create: () => this._open(),
		update: (row: Row) => this._open(row),
		delete: (row: Row) => this._confirmDelete(row),
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		void this._store.load();
	}

	/** Texts of every language file (all i18n folders), by language code, then by source text. */
	private async _fileTexts(): Promise<Map<string, Map<string, string>>> {
		const result = new Map<string, Map<string, string>>();

		await Promise.all(
			this._languages.map(async (language) => {
				result.set(language.code, await this._store.fileTexts(language.code));
			}),
		);

		return result;
	}

	private _form(sources: string[], row?: Row): FormInterface {
		const t = (text: string) => this._translate.translate(text)();

		return {
			formId: 'translation',
			title: t('Translations'),
			components: [
				{
					name: 'Select',
					key: 'sourceText',
					class: 'wselect--search-first',
					props: {
						label: t('Source text'),
						placeholder: t('Source text'),
						items: sources,
						searchable: true,
					},
				},
				...this._languages.map((language) => ({
					name: 'Input',
					key: language.code,
					focused: !!row && language.code === this._languages[0]?.code,
					props: { label: language.nativeName || language.name, placeholder: language.nativeName || language.name },
				})),
			],
		};
	}

	private async _open(row?: Row): Promise<void> {
		const texts = await this._fileTexts();
		const sources = [
			...new Set([
				...(row ? [row.sourceText] : []),
				...[...texts.values()].flatMap((byText) => [...byText.keys()]),
			]),
		].sort((a, b) => a.localeCompare(b));
		const form = this._form(sources, row);
		const values: Record<string, unknown> = { sourceText: null, ...Object.fromEntries(this._languages.map((l) => [l.code, ''])), ...(row ?? {}) };

		// The modal keeps one model per form id: start from this row, not from the last one opened.
		this._formService.reset('translation', values);

		let lastSource = String(values['sourceText'] ?? '');

		this._formService.modal<Record<string, unknown>>(
			form,
			{
				label: row ? 'Update' : 'Add',
				click: async (updated: unknown, close: () => void) => {
					close();

					await this._save(row, updated as Record<string, string>);
				},
			},
			values,
			(update) => {
				const source = String(update['sourceText'] ?? '');

				if (!source || source === lastSource) return;

				lastSource = source;

				// A text from the language files was picked: fill every language with what the files have.
				const prefill = Object.fromEntries(
					this._languages.map((language) => [language.code, texts.get(language.code)?.get(source) ?? '']),
				);

				// After the select has finished its own update, so the reset does not overwrite the picked option.
				setTimeout(() => this._formService.reset('translation', { ...update, sourceText: source, ...prefill }));
			},
		);
	}

	private async _save(row: Row | undefined, values: Record<string, string>): Promise<void> {
		const sourceText = (values['sourceText'] ?? '').trim();

		if (!sourceText) return;

		const translations: Record<string, string> = {};

		for (const language of this._languages) {
			const text = (values[language.code] ?? '').trim();

			if (text) translations[language.code] = text;
		}

		await this._run(async () => {
			if (row) {
				await this._store.save({ id: row.id, sourceText, translations } as TranslationEntry);
			} else {
				await this._store.add(sourceText, translations);
			}
		});
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Delete this translation?')(),
			timeout: 0,
			progress: false,
			buttons: [
				{
					text: this._translate.translate('Delete')(),
					callback: () => void this._run(() => this._store.remove(row.id)),
				},
				{ text: this._translate.translate('Cancel')() },
			],
		});
	}

	private async _run(job: () => Promise<void>): Promise<void> {
		this.failed.set(false);

		try {
			await job();
		} catch (error) {
			this.failed.set(true);
			this._errors.report(error, '[translates]');
		}
	}
}
