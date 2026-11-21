import { Service } from '@angular/core';
import { BosRecord, FirebaseRecordsStore } from './firebase-records.store';

/** The fields of a product that a person edits. */
export interface BosProductFields {
	name: string;
	sku: string;
	price: number;
	description: string;
}

/** A product in Firestore, in `bosProducts/<id>`. */
export interface BosProduct extends BosProductFields, BosRecord {}

export const NEW_PRODUCT: BosProductFields = { name: '', sku: '', price: 0, description: '' };

/**
 * Products kept in Firestore. An employee reads only the products they created; an administrator reads
 * all of them (see `FirebaseRecordsStore` for loading and paging).
 */
@Service()
export class FirebaseProductsService extends FirebaseRecordsStore<BosProduct> {
	protected readonly collectionName = 'bosProducts';
	protected readonly entity = 'product';

	readonly products = this.items;

	async create(fields: BosProductFields): Promise<void> {
		await this._create(this._clean(fields));
	}

	update(product: BosProduct, fields: BosProductFields): Promise<void> {
		return this._update(product, this._clean(fields));
	}

	protected fromDoc(id: string, data: Partial<BosProduct>): BosProduct {
		return {
			id,
			name: data.name ?? '',
			sku: data.sku ?? '',
			price: typeof data.price === 'number' ? data.price : 0,
			description: data.description ?? '',
			createdBy: data.createdBy ?? '',
			createdByEmail: data.createdByEmail ?? '',
			createdAt: data.createdAt ?? '',
		};
	}

	protected title(item: BosProduct): string {
		return item.name;
	}

	protected compare(a: BosProduct, b: BosProduct): number {
		return a.name.localeCompare(b.name);
	}

	private _clean(fields: BosProductFields): BosProductFields {
		const price = Number(fields.price);

		return {
			name: fields.name.trim(),
			sku: fields.sku.trim(),
			price: Number.isFinite(price) && price >= 0 ? price : 0,
			description: fields.description.trim(),
		};
	}
}
