import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormInterface, FormService } from '@wawjs/ngx-form';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonDirective, TableComponent } from '@wawjs/ngx-ui';
import { FirebaseCustomersService } from '../../feature/firebase/firebase-customers.service';
import {
	BosOrder,
	BosOrderFields,
	BosOrderStatus,
	FirebaseOrdersService,
	ORDER_STATUSES,
} from '../../feature/firebase/firebase-orders.service';
import { FirebaseProductsService } from '../../feature/firebase/firebase-products.service';
import { FirebaseErrorService } from '../../feature/firebase/firebase-errors';

/** A table row: the order id and what is shown of it. */
type Row = {
	id: string;
	customerName: string;
	productName: string;
	quantity: number;
	total: number;
	status: string;
	createdByEmail: string;
};

const STATUS_LABELS: Record<BosOrderStatus, string> = {
	new: 'New',
	paid: 'Paid',
	shipped: 'Shipped',
	done: 'Done',
	cancelled: 'Cancelled',
};

/**
 * Orders, with add, edit and delete: a customer, a product and a quantity. One page for two routes:
 * `/orders` shows the orders the signed-in employee created, `/admin/orders` shows everyone's (the route
 * data `scope` is `'mine'` or `'all'`).
 */
@Component({
	imports: [TableComponent, ButtonDirective, TranslateDirective],
	templateUrl: './orders.component.html',
})
export class OrdersComponent {
	private readonly _store = inject(FirebaseOrdersService);
	private readonly _customers = inject(FirebaseCustomersService);
	private readonly _products = inject(FirebaseProductsService);
	private readonly _formService = inject(FormService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	private readonly _scope: 'mine' | 'all' =
		inject(ActivatedRoute).snapshot.data['scope'] === 'all' ? 'all' : 'mine';

	/** Admins also see who created each order. */
	readonly columns = signal(
		this._scope === 'all'
			? ['customerName', 'productName', 'quantity', 'total', 'status', 'createdByEmail']
			: ['customerName', 'productName', 'quantity', 'total', 'status'],
	);

	readonly rows = computed<Row[]>(() =>
		this._store.orders().map((order) => ({
			id: order.id,
			customerName: order.customerName,
			productName: order.productName,
			quantity: order.quantity,
			total: order.total,
			status: this._translate.translate(STATUS_LABELS[order.status])(),
			createdByEmail: order.createdByEmail,
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
		searchBy: 'customerName',
		create: () => this._open(),
		update: (row: Row) => this._open(row),
		delete: (row: Row) => this._confirmDelete(row),
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		// Stop listening for live changes when the page closes.
		inject(DestroyRef).onDestroy(() => this._store.stop());

		// The stores are shared with the other pages: drop what they loaded, then read the same scope. The orders
		// are paged; the pickers need every customer and product, so those are read in full.
		this._store.orders.set([]);
		this._customers.customers.set([]);
		this._products.products.set([]);

		void this._run(() =>
			Promise.all([
				this._store.load(this._scope),
				this._customers.loadAll(this._scope),
				this._products.loadAll(this._scope),
			]).then(() => undefined),
		);
	}

	/** Reads the next page; the table search only covers the rows read so far. */
	loadMore(): void {
		void this._run(() => this._store.loadMore());
	}

	private _form(): FormInterface {
		const t = (text: string) => this._translate.translate(text)();

		return {
			formId: 'order',
			title: t('Orders'),
			components: [
				{
					name: 'Select',
					key: 'customerId',
					required: true,
					props: {
						label: `${t('Customer')} *`,
						placeholder: t('Customer'),
						items: this._customers.customers().map((customer) => ({ _id: customer.id, name: customer.name })),
						searchable: true,
						raw: true,
					},
				},
				{
					name: 'Select',
					key: 'productId',
					required: true,
					props: {
						label: `${t('Product')} *`,
						placeholder: t('Product'),
						items: this._products.products().map((product) => ({ _id: product.id, name: product.name })),
						searchable: true,
						raw: true,
					},
				},
				{
					name: 'Input',
					key: 'quantity',
					props: { label: t('Quantity'), placeholder: t('Quantity'), type: 'number' },
				},
				{
					name: 'Select',
					key: 'status',
					props: {
						label: t('Status'),
						placeholder: t('Status'),
						items: ORDER_STATUSES.map((_id) => ({ _id, name: t(STATUS_LABELS[_id]) })),
					},
				},
				{
					name: 'Input',
					key: 'notes',
					props: { label: t('Notes'), placeholder: t('Notes'), type: 'textarea' },
				},
			],
		};
	}

	private _open(row?: Row): void {
		const order = row ? this._store.orders().find((item) => item.id === row.id) : undefined;
		const values = {
			customerId: order?.customerId ?? null,
			productId: order?.productId ?? null,
			quantity: order?.quantity ?? 1,
			status: order?.status ?? 'new',
			notes: order?.notes ?? '',
		};

		// The modal keeps one model per form id: start from this order, not from the last one opened.
		this._formService.reset('order', { ...values });

		this._formService.modal<Record<string, unknown>>(
			this._form(),
			{
				label: order ? 'Update' : 'Add',
				click: async (updated: unknown, close: () => void) => {
					const fields = this._fields(updated as Partial<Record<string, unknown>>, order);

					if (!fields) {
						this._alertService.error({ text: this._translate.translate('Select a customer and a product')() });

						return;
					}

					close();

					await this._run(() => (order ? this._store.update(order, fields) : this._store.create(fields)));
				},
			},
			{ ...values },
		);
	}

	/** The fields to save, or `null` when the customer or the product is missing. */
	private _fields(values: Partial<Record<string, unknown>>, order?: BosOrder): BosOrderFields | null {
		return this._store.buildFields(
			{
				customerId: String(values['customerId'] ?? ''),
				productId: String(values['productId'] ?? ''),
				quantity: values['quantity'],
				status: values['status'],
				notes: values['notes'],
			},
			this._customers.customers(),
			this._products.products(),
			order,
		);
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Delete this order?')(),
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
			this._errors.report(error, '[orders]');
		}
	}
}
