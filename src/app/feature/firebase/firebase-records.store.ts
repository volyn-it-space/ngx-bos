import { inject, signal } from '@angular/core';
import type { QueryConstraint, QuerySnapshot } from 'firebase/firestore';
import { BosActivityAction, BosActivityEntity, FirebaseActivityService } from './firebase-activity.service';
import { FirebaseAuthService } from './firebase-auth.service';

/** Which records a list reads: the signed-in person's own (`'mine'`) or everyone's (`'all'`, administrators). */
export type BosScope = 'mine' | 'all';

/** How many records one page of a list reads. */
export const PAGE_SIZE = 20;

/** What every record of `bosCustomers`, `bosProducts`, `bosOrders` and `bosTasks` has. */
export interface BosRecord {
	id: string;

	/** Firebase uid and email of the employee (or admin) who created it. */
	createdBy: string;
	createdByEmail: string;

	/** ISO time of the creation; the lists are paged by it, newest first. */
	createdAt: string;
}

/** The fields of a record that a person writes: everything but the id and who created it when. */
export type BosRecordFields<T extends BosRecord> = Omit<T, keyof BosRecord>;

/**
 * Records kept in one Firestore collection, owned by the person who created them. An employee reads only
 * their own records; an administrator reads all of them. The Firestore rules enforce the same, so a read
 * must be filtered the same way.
 *
 * Lists are paged and live: `load()` listens to the newest `PAGE_SIZE` records, `loadMore()` widens the
 * listener by one page (while `hasMore()`), and changes by other people show up without a reload. The
 * listener runs until the next `load()` / `loadAll()` or `stop()`; a page calls `stop()` when it closes.
 * `loadAll()` reads every record once, for pickers and counts that need the complete list.
 */
export abstract class FirebaseRecordsStore<T extends BosRecord> {
	protected readonly _auth = inject(FirebaseAuthService);
	protected readonly _activity = inject(FirebaseActivityService);

	/** The records read so far, in the order of `compare`. */
	readonly items = signal<T[]>([]);

	/** True when a paged read found more records after the ones in `items`. */
	readonly hasMore = signal(false);

	/** True while a read runs. */
	readonly loading = signal(false);

	/** The Firestore collection, for example `bosCustomers`. */
	protected abstract readonly collectionName: string;

	/** What the activity log calls one record. */
	protected abstract readonly entity: BosActivityEntity;

	/** A record from a stored document; fills in what is missing. */
	protected abstract fromDoc(id: string, data: Partial<T>): T;

	/** The short name of a record in the activity log. */
	protected abstract title(item: T): string;

	/** Who an action on the record touches, in order of preference (see `recipientFor`). */
	protected recipients(item: T): (string | undefined)[] {
		return [item.createdByEmail];
	}

	/** The order of `items`. */
	protected abstract compare(a: T, b: T): number;

	/** Counts reads, so an older read that finishes late does not replace a newer one. */
	private _loadRun = 0;
	private _scope: BosScope = 'mine';

	/** How many pages the live listener covers. */
	private _pages = 1;

	/** Stops the live listener; null when none runs. */
	private _unsubscribe: (() => void) | null = null;

	/** Listens to the first page of the records of the scope (see `BosScope`). Resolves on the first result. */
	load(scope: BosScope): Promise<void> {
		this._scope = scope;
		this._pages = 1;

		return this._listen();
	}

	/** Widens the listener of the last `load()` by one page. */
	loadMore(): Promise<void> {
		if (!this.hasMore() || this.loading()) return Promise.resolve();

		this._pages += 1;

		return this._listen();
	}

	/** Reads every record of the scope once, without paging or listening (pickers, counts). */
	loadAll(scope: BosScope): Promise<void> {
		return this._readAll(scope);
	}

	/** Stops listening for changes; `items` keeps the last result. */
	stop(): void {
		this._loadRun++;
		this._unsubscribe?.();
		this._unsubscribe = null;
		this.loading.set(false);
	}

	async remove(id: string): Promise<void> {
		const { db, doc, deleteDoc } = await this._auth.firestore();

		const item = this.items().find((entry) => entry.id === id);

		await deleteDoc(doc(db, this.collectionName, id));

		if (item) this._record('delete', item);

		this.items.update((list) => list.filter((entry) => entry.id !== id));
	}

	/** Saves a new record as the signed-in person. Throws `not-signed-in` without a Firebase user. */
	protected async _create(fields: BosRecordFields<T>): Promise<T> {
		const user = this._auth.user();

		if (!user) throw new Error('not-signed-in');

		const { db, collection, addDoc } = await this._auth.firestore();
		const data = {
			...fields,
			createdBy: user.uid,
			createdByEmail: user.email ?? '',
			createdAt: new Date().toISOString(),
		};
		const ref = await addDoc(collection(db, this.collectionName), data);
		const item = { id: ref.id, ...data } as unknown as T;

		this._record('create', item);

		// The live listener may have delivered it already.
		this.items.update((list) => this._sorted([...list.filter((entry) => entry.id !== item.id), item]));

		return item;
	}

	/** Saves only the edited fields: the creator and creation time stay as they are in Firestore. */
	protected async _update(item: T, changes: Partial<BosRecordFields<T>>): Promise<void> {
		const { db, doc, updateDoc } = await this._auth.firestore();
		const next = { ...item, ...changes } as T;

		await updateDoc(doc(db, this.collectionName, item.id), changes as Record<string, unknown>);

		this._record('update', next);

		this.items.update((list) => this._sorted(list.map((entry) => (entry.id === item.id ? next : entry))));
	}

	private _record(action: BosActivityAction, item: T): void {
		void this._activity.record({
			action,
			entity: this.entity,
			entityId: item.id,
			title: this.title(item),
			recipientEmail: this._activity.recipientFor(...this.recipients(item)),
		});
	}

	/** Starts (or restarts, wider) the live listener of the current scope and page count. */
	private async _listen(): Promise<void> {
		const run = ++this._loadRun;

		this._unsubscribe?.();
		this._unsubscribe = null;
		this.loading.set(true);

		try {
			await this._auth.watch();

			const uid = this._auth.user()?.uid;

			if (run !== this._loadRun) return;

			if (!uid) {
				this.items.set([]);
				this.hasMore.set(false);

				return;
			}

			const { db, collection, query, where, orderBy, limit, onSnapshot } = await this._auth.firestore();

			if (run !== this._loadRun) return;

			const size = this._pages * PAGE_SIZE;
			const constraints: QueryConstraint[] = this._scope === 'all' ? [] : [where('createdBy', '==', uid)];

			// One more than the pages: whether it arrives tells if there is a next page.
			constraints.push(orderBy('createdAt', 'desc'), limit(size + 1));

			await new Promise<void>((resolve, reject) => {
				let first = true;

				this._unsubscribe = onSnapshot(
					query(collection(db, this.collectionName), ...constraints),
					(snapshot) => {
						if (run !== this._loadRun) return;

						this._apply(snapshot, size);

						if (first) {
							first = false;
							resolve();
						}
					},
					(error) => {
						if (first) {
							first = false;
							reject(error);
						} else {
							console.error('[' + this.collectionName + ']', error);
						}
					},
				);
			});
		} finally {
			if (run === this._loadRun) this.loading.set(false);
		}
	}

	private _apply(snapshot: QuerySnapshot, size: number): void {
		const docs = snapshot.docs.slice(0, size);

		this.items.set(this._sorted(docs.map((item) => this.fromDoc(item.id, item.data() as Partial<T>))));
		this.hasMore.set(snapshot.docs.length > size);
	}

	private async _readAll(scope: BosScope): Promise<void> {
		this.stop();

		const run = this._loadRun;

		this.loading.set(true);

		try {
			await this._auth.watch();

			const uid = this._auth.user()?.uid;

			if (run !== this._loadRun) return;

			if (!uid) {
				this.items.set([]);
				this.hasMore.set(false);

				return;
			}

			const { db, collection, getDocs, query, where } = await this._auth.firestore();
			const constraints: QueryConstraint[] = scope === 'all' ? [] : [where('createdBy', '==', uid)];

			// A full read keeps no order, so it also returns documents without `createdAt`.
			const snapshot = await getDocs(query(collection(db, this.collectionName), ...constraints));

			if (run !== this._loadRun) return;

			this.items.set(this._sorted(snapshot.docs.map((item) => this.fromDoc(item.id, item.data() as Partial<T>))));
			this.hasMore.set(false);
		} finally {
			if (run === this._loadRun) this.loading.set(false);
		}
	}

	private _sorted(list: T[]): T[] {
		return [...list].sort((a, b) => this.compare(a, b));
	}
}
