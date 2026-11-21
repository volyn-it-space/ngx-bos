import { Service } from '@angular/core';
import type { BosCustomer } from './firebase-customers.service';
import type { BosProduct } from './firebase-products.service';
import { BosRecord, FirebaseRecordsStore } from './firebase-records.store';

export const ORDER_STATUSES = ['new', 'paid', 'shipped', 'done', 'cancelled'] as const;
export type BosOrderStatus = (typeof ORDER_STATUSES)[number];

/** The fields of an order that a person edits. The names are copies, so an order stays readable if a customer or product changes. */
export interface BosOrderFields {
	customerId: string;
	customerName: string;
	productId: string;
	productName: string;
	quantity: number;

	/** Quantity times the price of the product when the order was saved. */
	total: number;
	status: BosOrderStatus;
	notes: string;
}

/** An order in Firestore, in `bosOrders/<id>`. */
export interface BosOrder extends BosOrderFields, BosRecord {}

/** What a person picks or types for an order. */
export interface BosOrderInput {
	customerId: string;
	productId: string;
	quantity: unknown;
	status: unknown;
	notes: unknown;
}

/**
 * Orders kept in Firestore. An employee reads only the orders they created; an administrator reads all
 * of them (see `FirebaseRecordsStore` for loading and paging).
 */
@Service()
export class FirebaseOrdersService extends FirebaseRecordsStore<BosOrder> {
	protected readonly collectionName = 'bosOrders';
	protected readonly entity = 'order';

	readonly orders = this.items;

	/**
	 * The fields to save for what was picked, or `null` when the customer or the product is missing. The
	 * names are copied from the lists. A new order (or one moved to another product) takes the price of the
	 * product now; an order that is being edited keeps its saved unit price, and its saved names when its
	 * customer or product is gone.
	 */
	buildFields(
		input: BosOrderInput,
		customers: BosCustomer[],
		products: BosProduct[],
		previous?: BosOrder,
	): BosOrderFields | null {
		const customer = customers.find((item) => item.id === input.customerId);
		const product = products.find((item) => item.id === input.productId);
		const customerName = customer?.name ?? (previous?.customerId === input.customerId ? previous.customerName : '');
		const productName = product?.name ?? (previous?.productId === input.productId ? previous.productName : '');

		if (!input.customerId || !input.productId || !customerName || !productName) return null;

		const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)) || 1);
		const status = ORDER_STATUSES.includes(input.status as BosOrderStatus) ? (input.status as BosOrderStatus) : 'new';
		const sameProduct = !!previous && previous.productId === input.productId;
		const savedUnitPrice = previous && previous.quantity ? previous.total / previous.quantity : null;

		// An edited order keeps the price it was saved with; only a new order or another product takes today's price.
		const total =
			previous && sameProduct && previous.quantity === quantity
				? previous.total
				: Math.round(((sameProduct ? savedUnitPrice : null) ?? product?.price ?? 0) * quantity * 100) / 100;

		return {
			customerId: input.customerId,
			customerName,
			productId: input.productId,
			productName,
			quantity,
			total,
			status,
			notes: String(input.notes ?? ''),
		};
	}

	async create(fields: BosOrderFields): Promise<void> {
		await this._create(this._clean(fields));
	}

	update(order: BosOrder, fields: BosOrderFields): Promise<void> {
		return this._update(order, this._clean(fields));
	}

	protected fromDoc(id: string, data: Partial<BosOrder>): BosOrder {
		return {
			id,
			customerId: data.customerId ?? '',
			customerName: data.customerName ?? '',
			productId: data.productId ?? '',
			productName: data.productName ?? '',
			quantity: typeof data.quantity === 'number' ? data.quantity : 0,
			total: typeof data.total === 'number' ? data.total : 0,
			status: ORDER_STATUSES.includes(data.status as BosOrderStatus) ? (data.status as BosOrderStatus) : 'new',
			notes: data.notes ?? '',
			createdBy: data.createdBy ?? '',
			createdByEmail: data.createdByEmail ?? '',
			createdAt: data.createdAt ?? '',
		};
	}

	protected title(item: BosOrder): string {
		return `${item.customerName} / ${item.productName}`;
	}

	/** Newest first. */
	protected compare(a: BosOrder, b: BosOrder): number {
		return b.createdAt.localeCompare(a.createdAt);
	}

	private _clean(fields: BosOrderFields): BosOrderFields {
		const quantity = Math.floor(Number(fields.quantity));
		const total = Number(fields.total);

		return {
			customerId: fields.customerId,
			customerName: fields.customerName.trim(),
			productId: fields.productId,
			productName: fields.productName.trim(),
			quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
			total: Number.isFinite(total) && total >= 0 ? total : 0,
			status: fields.status,
			notes: fields.notes.trim(),
		};
	}
}
