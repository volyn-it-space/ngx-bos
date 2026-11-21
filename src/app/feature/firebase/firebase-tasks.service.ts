import { Service } from '@angular/core';
import { BosRecord, FirebaseRecordsStore } from './firebase-records.store';

/** The fields of a task that a person edits. */
export interface BosTask {
	title: string;
	description: string;

	/** Email of the person the task is for. */
	assignee: string;

	/** `YYYY-MM-DD`, empty when there is no due date. */
	dueDate: string;
}

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export type BosTaskStatus = (typeof TASK_STATUSES)[number];

/** A task in Firestore, in `bosTasks/<id>`. */
export interface BosTaskRecord extends BosTask, BosRecord {
	status: BosTaskStatus;
}

export const NEW_TASK: BosTask = {
	title: '',
	description: '',
	assignee: '',
	dueDate: '',
};

/**
 * Tasks kept in Firestore. An employee reads only the tasks they created; an administrator reads all
 * of them (see `FirebaseRecordsStore` for loading and paging).
 */
@Service()
export class FirebaseTasksService extends FirebaseRecordsStore<BosTaskRecord> {
	protected readonly collectionName = 'bosTasks';
	protected readonly entity = 'task';

	readonly tasks = this.items;

	/** Creates a task (`todo` unless a status is given), and returns its id. */
	async create(task: BosTask, status: BosTaskStatus = 'todo'): Promise<string> {
		return (await this._create({ ...this._clean(task), status })).id;
	}

	update(task: BosTaskRecord, fields: BosTask, status: BosTaskStatus): Promise<void> {
		return this._update(task, { ...this._clean(fields), status });
	}

	protected fromDoc(id: string, data: Partial<BosTaskRecord>): BosTaskRecord {
		return {
			id,
			title: data.title ?? '',
			description: data.description ?? '',
			assignee: data.assignee ?? '',
			dueDate: data.dueDate ?? '',
			status: TASK_STATUSES.includes(data.status as BosTaskStatus) ? (data.status as BosTaskStatus) : 'todo',
			createdBy: data.createdBy ?? '',
			createdByEmail: data.createdByEmail ?? '',
			createdAt: data.createdAt ?? '',
		};
	}

	protected title(item: BosTaskRecord): string {
		return item.title;
	}

	/** The assignee first, else the creator. */
	protected override recipients(item: BosTaskRecord): (string | undefined)[] {
		return [item.assignee, item.createdByEmail];
	}

	/** Newest first. */
	protected compare(a: BosTaskRecord, b: BosTaskRecord): number {
		return b.createdAt.localeCompare(a.createdAt);
	}

	private _clean(task: BosTask): BosTask {
		return {
			title: task.title.trim(),
			description: task.description.trim(),
			assignee: task.assignee.trim(),
			dueDate: task.dueDate,
		};
	}
}
