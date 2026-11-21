import { Service, computed, inject, signal } from '@angular/core';
import { FirebaseAuthService } from './firebase-auth.service';

export type BosActivityAction = 'create' | 'update' | 'delete' | 'accept' | 'ignore' | 'request';

export type BosActivityEntity =
	| 'task'
	| 'customer'
	| 'product'
	| 'order'
	| 'employee'
	| 'employee-request'
	| 'company'
	| 'translation';

/** What a caller says about an action. The actor and the time are added here. */
export interface BosActivityInput {
	action: BosActivityAction;
	entity: BosActivityEntity;
	entityId: string;

	/** A short name of the thing, for example the title of a task. */
	title: string;

	/** Email of the person the action touches; set it and the action is also a notification for them. */
	recipientEmail?: string;
}

/** One entry of `bosActivity/<id>`: the activity log and the notifications are the same table. */
export interface BosActivity {
	id: string;
	action: BosActivityAction;
	entity: BosActivityEntity;
	entityId: string;
	title: string;
	actorUid: string;
	actorEmail: string;
	actorName: string;

	/** Empty for an action that touches nobody else; otherwise the person it is a notification for. */
	recipientEmail: string;

	/** Whether the recipient has read the notification. */
	read: boolean;
	createdAt: string;
}

const COLLECTION = 'bosActivity';

/** How many entries the administrators' log reads. */
const LOG_LIMIT = 200;

/**
 * Who did what, kept in one Firestore table. Every create, update or delete is an entry that the
 * administrators see in the activity log. An entry that touches another person (it has a
 * `recipientEmail`) is also a notification for that person. Writing an entry never fails the action
 * that caused it.
 */
@Service()
export class FirebaseActivityService {
	private readonly _auth = inject(FirebaseAuthService);

	/** The entries last read, newest first (the log for administrators, the notifications otherwise). */
	readonly entries = signal<BosActivity[]>([]);

	/** Notifications that were not read yet (counts the entries read by `loadMine`). */
	readonly unread = computed(() => this.entries().filter((entry) => !entry.read).length);

	/**
	 * The first email that is not the signed-in person's own, in the order given: who an action touches
	 * (a person is not notified about what they did themselves). Empty when there is none.
	 */
	recipientFor(...candidates: (string | undefined)[]): string {
		const own = this._ownEmail();

		return (
			candidates.map((email) => (email ?? '').trim().toLowerCase()).find((email) => !!email && email !== own) ?? ''
		);
	}

	/** Writes an entry. Failures are only logged: the action that caused it already happened. */
	async record(input: BosActivityInput): Promise<void> {
		try {
			const user = this._auth.user();

			if (!user) return;

			const { db, collection, addDoc } = await this._auth.firestore();

			await addDoc(collection(db, COLLECTION), {
				action: input.action,
				entity: input.entity,
				entityId: input.entityId,
				title: input.title.slice(0, 200),
				actorUid: user.uid,
				actorEmail: user.email ?? '',
				actorName: (user.name ?? '').slice(0, 120),
				recipientEmail: (input.recipientEmail ?? '').trim().toLowerCase(),
				read: false,
				createdAt: new Date().toISOString(),
			});
		} catch (error) {
			console.error('[activity]', error);
		}
	}

	/** Reads the newest entries of everyone. Only administrators may. */
	async loadAll(): Promise<void> {
		this.stop();

		await this._auth.watch();

		const { db, collection, getDocs, query, orderBy, limit } = await this._auth.firestore();
		const snapshot = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(LOG_LIMIT)));

		this.entries.set(this._read(snapshot.docs));
	}

	/** Stops the live notifications listener; null when none runs. */
	private _unsubscribe: (() => void) | null = null;
	private _listenRun = 0;

	/**
	 * Listens to the notifications of the signed-in person (the entries that touch them), so new ones show
	 * up without a reload. Resolves on the first result; runs until `stop()`.
	 */
	async loadMine(): Promise<void> {
		const run = ++this._listenRun;

		this._unsubscribe?.();
		this._unsubscribe = null;

		await this._auth.watch();

		const email = this._ownEmail();

		if (run !== this._listenRun) return;

		if (!email) {
			this.entries.set([]);

			return;
		}

		const { db, collection, query, where, onSnapshot } = await this._auth.firestore();

		if (run !== this._listenRun) return;

		await new Promise<void>((resolve, reject) => {
			let first = true;

			this._unsubscribe = onSnapshot(
				query(collection(db, COLLECTION), where('recipientEmail', '==', email)),
				(snapshot) => {
					if (run !== this._listenRun) return;

					this.entries.set(this._read(snapshot.docs));

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
						console.error('[activity]', error);
					}
				},
			);
		});
	}

	/** Stops listening for notifications; `entries` keeps the last result. */
	stop(): void {
		this._listenRun++;
		this._unsubscribe?.();
		this._unsubscribe = null;
	}

	async markRead(id: string): Promise<void> {
		const { db, doc, updateDoc } = await this._auth.firestore();

		await updateDoc(doc(db, COLLECTION, id), { read: true });

		this.entries.update((list) => list.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)));
	}

	async markAllRead(): Promise<void> {
		await Promise.all(
			this.entries()
				.filter((entry) => !entry.read)
				.map((entry) => this.markRead(entry.id)),
		);
	}

	private _ownEmail(): string {
		return (this._auth.user()?.email ?? '').trim().toLowerCase();
	}

	private _read(docs: { id: string; data: () => unknown }[]): BosActivity[] {
		return docs
			.map((item) => {
				const data = item.data() as Partial<BosActivity>;

				return {
					id: item.id,
					action: data.action ?? 'update',
					entity: data.entity ?? 'task',
					entityId: data.entityId ?? '',
					title: data.title ?? '',
					actorUid: data.actorUid ?? '',
					actorEmail: data.actorEmail ?? '',
					actorName: data.actorName ?? '',
					recipientEmail: data.recipientEmail ?? '',
					read: data.read === true,
					createdAt: data.createdAt ?? '',
				};
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
}
