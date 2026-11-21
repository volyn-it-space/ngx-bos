import { Service } from '@angular/core';
import { BosRecord, FirebaseRecordsStore } from './firebase-records.store';

/** The fields of a customer that a person edits. */
export interface BosCustomerFields {
	name: string;
	email: string;
	phone: string;
	notes: string;
}

/** A customer in Firestore, in `bosCustomers/<id>`. */
export interface BosCustomer extends BosCustomerFields, BosRecord {}

export const NEW_CUSTOMER: BosCustomerFields = { name: '', email: '', phone: '', notes: '' };

/**
 * Customers kept in Firestore. An employee reads only the customers they created; an administrator reads
 * all of them (see `FirebaseRecordsStore` for loading and paging).
 */
@Service()
export class FirebaseCustomersService extends FirebaseRecordsStore<BosCustomer> {
	protected readonly collectionName = 'bosCustomers';
	protected readonly entity = 'customer';

	readonly customers = this.items;

	async create(fields: BosCustomerFields): Promise<void> {
		await this._create(this._clean(fields));
	}

	update(customer: BosCustomer, fields: BosCustomerFields): Promise<void> {
		return this._update(customer, this._clean(fields));
	}

	protected fromDoc(id: string, data: Partial<BosCustomer>): BosCustomer {
		return {
			id,
			name: data.name ?? '',
			email: data.email ?? '',
			phone: data.phone ?? '',
			notes: data.notes ?? '',
			createdBy: data.createdBy ?? '',
			createdByEmail: data.createdByEmail ?? '',
			createdAt: data.createdAt ?? '',
		};
	}

	protected title(item: BosCustomer): string {
		return item.name;
	}

	protected compare(a: BosCustomer, b: BosCustomer): number {
		return a.name.localeCompare(b.name);
	}

	private _clean(fields: BosCustomerFields): BosCustomerFields {
		return {
			name: fields.name.trim(),
			email: fields.email.trim(),
			phone: fields.phone.trim(),
			notes: fields.notes.trim(),
		};
	}
}
