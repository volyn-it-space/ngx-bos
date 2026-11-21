import { Service, inject, signal } from '@angular/core';
import { FirebaseActivityService } from './firebase-activity.service';
import { FirebaseAuthService } from './firebase-auth.service';

/** The general information about the company, in `bosCompany/general`. */
export interface BosCompany {
	name: string;
	legalName: string;
	email: string;
	phone: string;
	website: string;
	address: string;
	taxId: string;
	description: string;
}

export const NEW_COMPANY: BosCompany = {
	name: '',
	legalName: '',
	email: '',
	phone: '',
	website: '',
	address: '',
	taxId: '',
	description: '',
};

const COLLECTION = 'bosCompany';
const DOCUMENT = 'general';

/** The company information, one document in Firestore. Signed users read it; administrators change it. */
@Service()
export class FirebaseCompanyService {
	private readonly _auth = inject(FirebaseAuthService);
	private readonly _activity = inject(FirebaseActivityService);

	readonly company = signal<BosCompany>({ ...NEW_COMPANY });

	/** Reads the saved information; a company that was never saved stays empty. */
	async load(): Promise<void> {
		await this._auth.watch();

		const { db, doc, getDoc } = await this._auth.firestore();
		const snapshot = await getDoc(doc(db, COLLECTION, DOCUMENT));
		const data = snapshot.exists() ? (snapshot.data() as Partial<BosCompany>) : {};

		this.company.set({
			name: data.name ?? '',
			legalName: data.legalName ?? '',
			email: data.email ?? '',
			phone: data.phone ?? '',
			website: data.website ?? '',
			address: data.address ?? '',
			taxId: data.taxId ?? '',
			description: data.description ?? '',
		});
	}

	async save(company: BosCompany): Promise<void> {
		const { db, doc, setDoc } = await this._auth.firestore();
		const clean: BosCompany = {
			name: company.name.trim(),
			legalName: company.legalName.trim(),
			email: company.email.trim(),
			phone: company.phone.trim(),
			website: company.website.trim(),
			address: company.address.trim(),
			taxId: company.taxId.trim(),
			description: company.description.trim(),
		};

		// Merge: the document may not exist yet, and fields this form does not know are kept.
		await setDoc(doc(db, COLLECTION, DOCUMENT), clean, { merge: true });

		void this._activity.record({
			action: 'update',
			entity: 'company',
			entityId: DOCUMENT,
			title: clean.name,
		});

		this.company.set(clean);
	}
}
