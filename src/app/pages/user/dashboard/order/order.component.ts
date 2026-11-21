import { Component, computed, inject, signal } from '@angular/core';
import { form, submit } from '@angular/forms/signals';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonComponent, InputComponent, SelectComponent } from '@wawjs/ngx-ui';
import { FirebaseAuthService } from '../../../../feature/firebase/firebase-auth.service';
import { FirebaseCustomersService } from '../../../../feature/firebase/firebase-customers.service';
import { FirebaseOrdersService, ORDER_STATUSES } from '../../../../feature/firebase/firebase-orders.service';
import { FirebaseProductsService } from '../../../../feature/firebase/firebase-products.service';
import { FirebaseErrorService } from '../../../../feature/firebase/firebase-errors';

/** What the form holds besides the two lists: the quantity is text while it is typed. */
interface OrderForm {
	quantity: string;
	notes: string;
}

const NEW_ORDER_FORM: OrderForm = { quantity: '1', notes: '' };

const STATUS_LABELS: Record<string, string> = {
	new: 'New',
	paid: 'Paid',
	shipped: 'Shipped',
	done: 'Done',
	cancelled: 'Cancelled',
};

@Component({
	selector: 'app-dashboard-order',
	imports: [ButtonComponent, InputComponent, SelectComponent, TranslateDirective],
	templateUrl: './order.component.html',
})
export class DashboardOrderComponent {
	private readonly _ordersService = inject(FirebaseOrdersService);
	private readonly _customersService = inject(FirebaseCustomersService);
	private readonly _productsService = inject(FirebaseProductsService);
	private readonly _auth = inject(FirebaseAuthService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	readonly translateService = inject(TranslateService);

	readonly orderModel = signal<OrderForm>({ ...NEW_ORDER_FORM });
	readonly orderForm = form(this.orderModel);

	readonly customerId = signal<string | null>(null);
	readonly productId = signal<string | null>(null);
	readonly status = signal<string | null>('new');
	readonly saving = signal(false);

	/** The customers and the products the signed-in person can pick from. */
	readonly customers = computed(() =>
		this._customersService.customers().map((customer) => ({ _id: customer.id, name: customer.name })),
	);
	readonly products = computed(() =>
		this._productsService.products().map((product) => ({ _id: product.id, name: product.name })),
	);
	readonly statuses = computed(() =>
		ORDER_STATUSES.map((_id) => ({ _id, name: this.translateService.translate(STATUS_LABELS[_id])() })),
	);

	readonly isSubmitDisabled = computed(() => !this.customerId() || !this.productId() || this.saving());

	constructor() {
		const scope = this._auth.isAdmin() ? 'all' : 'mine';

		// The lists are shared with the Customers and Products pages, which read them a page at a time; the
		// pickers need every customer and product, so they are read in full here.
		this._customersService.customers.set([]);
		this._productsService.products.set([]);

		void Promise.all([this._customersService.loadAll(scope), this._productsService.loadAll(scope)]).catch((error) => {
			this._errors.report(error, '[orders]');
		});
	}

	wFormSubmit() {
		submit(this.orderForm, async (field) => {
			const value = field().value();
			const fields = this._ordersService.buildFields(
				{
					customerId: this.customerId() ?? '',
					productId: this.productId() ?? '',
					quantity: value.quantity,
					status: this.status(),
					notes: value.notes,
				},
				this._customersService.customers(),
				this._productsService.products(),
			);

			if (!fields) {
				this._alertService.error({ text: this.translateService.translate('Select a customer and a product')() });

				return undefined;
			}

			this.saving.set(true);

			try {
				await this._ordersService.create(fields);

				this._alertService.success({
					text: this.translateService.translate('Order has been created')(),
				});

				// Clear the form only after the order was saved.
				this.orderModel.set({ ...NEW_ORDER_FORM });
				this.customerId.set(null);
				this.productId.set(null);
				this.status.set('new');
			} catch (error) {
				this._errors.report(error, '[orders]');
			} finally {
				this.saving.set(false);
			}

			return undefined;
		});
	}
}
