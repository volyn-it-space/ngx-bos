import { Service, computed, inject, signal } from '@angular/core';
import { environment } from '@env';
import { FirebaseActivityService } from './firebase-activity.service';
import { FirebaseAuthService } from './firebase-auth.service';
import type { BosProfile } from './firebase-profile.service';

/** A signed-in person, from `bosProfiles/<uid>`. */
export interface BosPerson {
	uid: string;
	email: string;
	name: string;
}

/** An employee, in `bosEmployees/<uid>`. The document id is the Firebase uid. */
export interface BosEmployee extends BosPerson {
	addedAt: string;
}

/** A signed user asking an administrator for employee access, in `bosEmployeeRequests/<uid>`. */
export interface BosEmployeeRequest extends BosPerson {
	requestedAt: string;
}

const EMPLOYEES = 'bosEmployees';
const REQUESTS = 'bosEmployeeRequests';
const PROFILES = 'bosProfiles';

/**
 * Employees kept in Firestore, and the people who can still be added: signed users that are neither
 * an employee nor one of `environment.admins`. Reading all profiles needs the admin rules in Firestore.
 */
@Service()
export class FirebaseEmployeesService {
	private readonly _auth = inject(FirebaseAuthService);
	private readonly _activity = inject(FirebaseActivityService);

	readonly employees = signal<BosEmployee[]>([]);
	readonly people = signal<BosPerson[]>([]);

	/** Open requests for employee access (administrators read them). */
	readonly requests = signal<BosEmployeeRequest[]>([]);
	readonly isLoaded = signal(false);

	/** Signed users that can be added: not an employee yet and not an admin account. */
	readonly candidates = computed(() => {
		const employees = new Set(this.employees().map((employee) => employee.uid));

		return this.people().filter((person) => !employees.has(person.uid) && !this._isAdmin(person));
	});

	/** Whether the signed-in person has an employee document (read once by `checkSelf`). */
	private readonly _selfEmployee = signal(false);

	/** Whether the signed-in person has an open request (read once by `checkSelf`). */
	readonly selfRequested = signal(false);

	/** True when the signed-in person is an employee: checked on their own, or listed after the page loaded. */
	readonly isEmployee = computed(() => {
		const uid = this._auth.user()?.uid;

		return !!uid && (this._selfEmployee() || this.employees().some((employee) => employee.uid === uid));
	});

	private _loading?: Promise<void>;

	/** Checks whether the signed-in person is an employee, and whether they have an open request. */
	async checkSelf(): Promise<void> {
		try {
			await this._auth.watch();

			const uid = this._auth.user()?.uid;

			if (!uid) return;

			const { db, doc, getDoc } = await this._auth.firestore();
			const [employee, request] = await Promise.all([
				getDoc(doc(db, EMPLOYEES, uid)),
				getDoc(doc(db, REQUESTS, uid)),
			]);

			this._selfEmployee.set(employee.exists());
			this.selfRequested.set(request.exists());
		} catch {
			this._selfEmployee.set(false);
			this.selfRequested.set(false);
		}
	}

	/** Asks the administrators for employee access, as the signed-in person. */
	async requestAccess(): Promise<void> {
		const user = this._auth.user();

		if (!user) return;

		const { db, doc, setDoc } = await this._auth.firestore();
		const request: BosEmployeeRequest = {
			uid: user.uid,
			email: user.email ?? '',
			name: user.name ?? '',
			requestedAt: new Date().toISOString(),
		};

		await setDoc(doc(db, REQUESTS, user.uid), request);

		void this._activity.record({
			action: 'request',
			entity: 'employee-request',
			entityId: user.uid,
			title: request.name || request.email,
		});

		this.selfRequested.set(true);
	}

	/** Accepts a request: the person becomes an employee and the request is removed. */
	async accept(request: BosEmployeeRequest): Promise<void> {
		await this.add(request);
		await this._removeRequest(request.uid);

		void this._activity.record({
			action: 'accept',
			entity: 'employee-request',
			entityId: request.uid,
			title: request.name || request.email,
			recipientEmail: this._activity.recipientFor(request.email),
		});
	}

	/** Removes a request without adding the person. */
	async ignore(uid: string): Promise<void> {
		const request = this.requests().find((item) => item.uid === uid);

		await this._removeRequest(uid);

		if (request) {
			void this._activity.record({
				action: 'ignore',
				entity: 'employee-request',
				entityId: uid,
				title: request.name || request.email,
				recipientEmail: this._activity.recipientFor(request.email),
			});
		}
	}

	private async _removeRequest(uid: string): Promise<void> {
		const { db, doc, deleteDoc } = await this._auth.firestore();

		await deleteDoc(doc(db, REQUESTS, uid));

		this.requests.update((list) => list.filter((item) => item.uid !== uid));
	}

	/** Reads the employees and the signed users once. Safe to call again. */
	load(): Promise<void> {
		return (this._loading ??= this._read()
			.catch((error) => {
				// Do not keep a failed read: the next call tries again.
				this._loading = undefined;

				throw error;
			})
			.finally(() => this.isLoaded.set(true)));
	}

	/** Reads both lists again (a new person may have signed in meanwhile). */
	reload(): Promise<void> {
		this._loading = undefined;

		return this.load();
	}

	async add(person: BosPerson): Promise<void> {
		const { db, doc, setDoc } = await this._auth.firestore();
		const employee: BosEmployee = {
			uid: person.uid,
			email: person.email,
			name: person.name,
			addedAt: new Date().toISOString(),
		};

		await setDoc(doc(db, EMPLOYEES, person.uid), employee);

		void this._activity.record({
			action: 'create',
			entity: 'employee',
			entityId: person.uid,
			title: person.name || person.email,
			recipientEmail: this._activity.recipientFor(person.email),
		});

		this.employees.update((list) => [...list.filter((item) => item.uid !== employee.uid), employee]);
	}

	async remove(uid: string): Promise<void> {
		const { db, doc, deleteDoc } = await this._auth.firestore();

		const employee = this.employees().find((item) => item.uid === uid);

		await deleteDoc(doc(db, EMPLOYEES, uid));

		if (employee) {
			void this._activity.record({
				action: 'delete',
				entity: 'employee',
				entityId: uid,
				title: employee.name || employee.email,
				recipientEmail: this._activity.recipientFor(employee.email),
			});
		}

		this.employees.update((list) => list.filter((item) => item.uid !== uid));
	}

	private async _read(): Promise<void> {
		await this._auth.watch();

		const { db, collection, getDocs } = await this._auth.firestore();
		const [employees, profiles, requests] = await Promise.all([
			getDocs(collection(db, EMPLOYEES)),
			getDocs(collection(db, PROFILES)),
			getDocs(collection(db, REQUESTS)),
		]);

		this.requests.set(
			requests.docs
				.map((item) => {
					const data = item.data() as Partial<BosEmployeeRequest>;

					return {
						uid: item.id,
						email: data.email ?? '',
						name: data.name ?? '',
						requestedAt: data.requestedAt ?? '',
					};
				})
				.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
		);

		this.employees.set(
			employees.docs
				.map((item) => {
					const data = item.data() as Partial<BosEmployee>;

					return {
						uid: item.id,
						email: data.email ?? '',
						name: data.name ?? '',
						addedAt: data.addedAt ?? '',
					};
				})
				.sort((a, b) => this._label(a).localeCompare(this._label(b))),
		);

		this.people.set(
			profiles.docs
				.map((item) => {
					const data = item.data() as BosProfile;

					return {
						uid: item.id,
						email: data.email ?? '',
						name: data.name || data.displayName || '',
					};
				})
				.sort((a, b) => this._label(a).localeCompare(this._label(b))),
		);

		console.info(
			`[employees] read ${profiles.docs.length} profiles and ${employees.docs.length} employees; ` +
				`${this.candidates().length} can be added (admins and employees are left out)`,
		);
	}

	private _label(person: BosPerson): string {
		return person.name || person.email || person.uid;
	}

	private _isAdmin(person: BosPerson): boolean {
		const email = person.email.trim().toLowerCase();

		return environment.admins.some(
			(admin) => admin.uid === person.uid || (!!email && admin.email.toLowerCase() === email),
		);
	}
}
