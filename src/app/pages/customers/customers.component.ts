import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormInterface, FormService } from '@wawjs/ngx-form';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonDirective, TableComponent } from '@wawjs/ngx-ui';
import {
	BosCustomerFields,
	FirebaseCustomersService,
	NEW_CUSTOMER,
} from '../../feature/firebase/firebase-customers.service';
import { FirebaseErrorService } from '../../feature/firebase/firebase-errors';

/** A table row: the customer id and what is shown of it. */
type Row = { id: string; name: string; email: string; phone: string; createdByEmail: string };

/**
 * Customers, with add, edit and delete. One page for two routes: `/customers` shows the customers the signed-in
 * employee created, `/admin/customers` shows everyone's (the route data `scope` is `'mine'` or `'all'`).
 */
@Component({
	imports: [TableComponent, ButtonDirective, TranslateDirective],
	templateUrl: './customers.component.html',
})
export class CustomersComponent {
	private readonly _store = inject(FirebaseCustomersService);
	private readonly _formService = inject(FormService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	private readonly _scope: 'mine' | 'all' =
		inject(ActivatedRoute).snapshot.data['scope'] === 'all' ? 'all' : 'mine';

	/** Admins also see who created each customer. */
	readonly columns = signal(
		this._scope === 'all' ? ['name', 'email', 'phone', 'createdByEmail'] : ['name', 'email', 'phone'],
	);

	readonly rows = computed<Row[]>(() =>
		this._store.customers().map((customer) => ({
			id: customer.id,
			name: customer.name,
			email: customer.email,
			phone: customer.phone,
			createdByEmail: customer.createdByEmail,
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

		// The store is shared by both routes: drop what the other one loaded before showing this one.
		this._store.customers.set([]);

		void this._run(() => this._store.load(this._scope));
	}

	/** Reads the next page; the table search only covers the rows read so far. */
	loadMore(): void {
		void this._run(() => this._store.loadMore());
	}

	private _form(): FormInterface {
		const t = (text: string) => this._translate.translate(text)();

		return {
			formId: 'customer',
			title: t('Customers'),
			components: [
				{
					name: 'Input',
					key: 'name',
					focused: true,
					required: true,
					// The input does not draw a required marker by itself, so the label carries it.
					props: { label: `${t('Name')} *`, placeholder: t('Name') },
				},
				{ name: 'Input', key: 'email', props: { label: t('Email'), placeholder: t('Email'), type: 'email' } },
				{ name: 'Input', key: 'phone', props: { label: t('Phone'), placeholder: t('Phone'), type: 'tel' } },
				{ name: 'Input', key: 'notes', props: { label: t('Notes'), placeholder: t('Notes'), type: 'textarea' } },
			],
		};
	}

	private _open(row?: Row): void {
		const customer = row ? this._store.customers().find((item) => item.id === row.id) : undefined;
		const values: BosCustomerFields = customer
			? { name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes }
			: { ...NEW_CUSTOMER };

		// The modal keeps one model per form id: start from this customer, not from the last one opened.
		this._formService.reset('customer', { ...values });

		this._formService.modal<Record<string, unknown>>(
			this._form(),
			{
				label: customer ? 'Update' : 'Add',
				click: async (updated: unknown, close: () => void) => {
					const fields = this._fields(updated as Partial<BosCustomerFields>);

					if (!fields.name.trim()) {
						this._alertService.error({ text: this._translate.translate('Enter the customer name...')() });

						return;
					}

					close();

					await this._run(() => (customer ? this._store.update(customer, fields) : this._store.create(fields)));
				},
			},
			{ ...values },
		);
	}

	private _fields(values: Partial<BosCustomerFields>): BosCustomerFields {
		return {
			name: String(values.name ?? ''),
			email: String(values.email ?? ''),
			phone: String(values.phone ?? ''),
			notes: String(values.notes ?? ''),
		};
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Delete this customer?')(),
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
			this._errors.report(error, '[customers]');
		}
	}
}
