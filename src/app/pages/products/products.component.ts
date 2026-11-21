import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormInterface, FormService } from '@wawjs/ngx-form';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonDirective, TableComponent } from '@wawjs/ngx-ui';
import {
	BosProductFields,
	FirebaseProductsService,
	NEW_PRODUCT,
} from '../../feature/firebase/firebase-products.service';
import { FirebaseErrorService } from '../../feature/firebase/firebase-errors';

/** A table row: the product id and what is shown of it. */
type Row = { id: string; name: string; sku: string; price: number; createdByEmail: string };

/**
 * Products, with add, edit and delete. One page for two routes: `/products` shows the products the signed-in
 * employee created, `/admin/products` shows everyone's (the route data `scope` is `'mine'` or `'all'`).
 */
@Component({
	imports: [TableComponent, ButtonDirective, TranslateDirective],
	templateUrl: './products.component.html',
})
export class ProductsComponent {
	private readonly _store = inject(FirebaseProductsService);
	private readonly _formService = inject(FormService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	private readonly _scope: 'mine' | 'all' =
		inject(ActivatedRoute).snapshot.data['scope'] === 'all' ? 'all' : 'mine';

	/** Admins also see who created each product. */
	readonly columns = signal(
		this._scope === 'all' ? ['name', 'sku', 'price', 'createdByEmail'] : ['name', 'sku', 'price'],
	);

	readonly rows = computed<Row[]>(() =>
		this._store.products().map((product) => ({
			id: product.id,
			name: product.name,
			sku: product.sku,
			price: product.price,
			createdByEmail: product.createdByEmail,
		})),
	);

	readonly failed = signal(false);

	/** The list is read a page at a time: whether there is a next page, and whether a read runs. */
	readonly hasMore = this._store.hasMore;
	readonly loading = this._store.loading;

	readonly config = {
		allDocs: true,
		perPage: 50,
		page: 1,
		searchBy: 'name',
		create: () => this._open(),
		update: (row: Row) => this._open(row),
		delete: (row: Row) => this._confirmDelete(row),
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		// Stop listening for live changes when the page closes.
		inject(DestroyRef).onDestroy(() => this._store.stop());

		// The store is shared by both routes (and the orders page): drop what the other one loaded.
		this._store.products.set([]);

		void this._run(() => this._store.load(this._scope));
	}

	/** Reads the next page; the table search only covers the rows read so far. */
	loadMore(): void {
		void this._run(() => this._store.loadMore());
	}

	private _form(): FormInterface {
		const t = (text: string) => this._translate.translate(text)();

		return {
			formId: 'product',
			title: t('Products'),
			components: [
				{
					name: 'Input',
					key: 'name',
					focused: true,
					required: true,
					// The input does not draw a required marker by itself, so the label carries it.
					props: { label: `${t('Name')} *`, placeholder: t('Name') },
				},
				{ name: 'Input', key: 'sku', props: { label: t('SKU'), placeholder: t('SKU') } },
				{ name: 'Input', key: 'price', props: { label: t('Price'), placeholder: t('Price'), type: 'number' } },
				{
					name: 'Input',
					key: 'description',
					props: { label: t('Description'), placeholder: t('Description'), type: 'textarea' },
				},
			],
		};
	}

	private _open(row?: Row): void {
		const product = row ? this._store.products().find((item) => item.id === row.id) : undefined;
		const values: BosProductFields = product
			? { name: product.name, sku: product.sku, price: product.price, description: product.description }
			: { ...NEW_PRODUCT };

		// The modal keeps one model per form id: start from this product, not from the last one opened.
		this._formService.reset('product', { ...values });

		this._formService.modal<Record<string, unknown>>(
			this._form(),
			{
				label: product ? 'Update' : 'Add',
				click: async (updated: unknown, close: () => void) => {
					const fields = this._fields(updated as Partial<Record<keyof BosProductFields, unknown>>);

					if (!fields.name.trim()) {
						this._alertService.error({ text: this._translate.translate('Enter the product name...')() });

						return;
					}

					close();

					await this._run(() => (product ? this._store.update(product, fields) : this._store.create(fields)));
				},
			},
			{ ...values },
		);
	}

	private _fields(values: Partial<Record<keyof BosProductFields, unknown>>): BosProductFields {
		return {
			name: String(values.name ?? ''),
			sku: String(values.sku ?? ''),
			price: Number(values.price ?? 0),
			description: String(values.description ?? ''),
		};
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Delete this product?')(),
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
			this._errors.report(error, '[products]');
		}
	}
}
