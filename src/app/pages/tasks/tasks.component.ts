import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormInterface, FormService } from '@wawjs/ngx-form';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonDirective, TableComponent } from '@wawjs/ngx-ui';
import {
	BosTask,
	BosTaskRecord,
	BosTaskStatus,
	FirebaseTasksService,
	NEW_TASK,
} from '../../feature/firebase/firebase-tasks.service';
import { FirebaseErrorService } from '../../feature/firebase/firebase-errors';

/** A table row: the task id and what is shown of it. */
type Row = {
	id: string;
	title: string;
	assignee: string;
	dueDate: string;
	status: string;
	createdByEmail: string;
};

const STATUS_LABELS: Record<BosTaskStatus, string> = {
	todo: 'To do',
	'in-progress': 'In progress',
	done: 'Done',
};

/**
 * Tasks, with add, edit and delete. One page for two routes: `/tasks` shows the tasks the signed-in
 * employee created, `/admin/tasks` shows everyone's (the route data `scope` is `'mine'` or `'all'`).
 */
@Component({
	imports: [TableComponent, ButtonDirective, TranslateDirective],
	templateUrl: './tasks.component.html',
})
export class TasksComponent {
	private readonly _store = inject(FirebaseTasksService);
	private readonly _formService = inject(FormService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	private readonly _scope: 'mine' | 'all' =
		inject(ActivatedRoute).snapshot.data['scope'] === 'all' ? 'all' : 'mine';

	/** Admins also see who created each task. */
	readonly columns = signal(
		this._scope === 'all'
			? ['title', 'assignee', 'dueDate', 'status', 'createdByEmail']
			: ['title', 'assignee', 'dueDate', 'status'],
	);

	readonly rows = computed<Row[]>(() =>
		this._store.tasks().map((task) => ({
			id: task.id,
			title: task.title,
			assignee: task.assignee,
			dueDate: task.dueDate,
			status: this._translate.translate(STATUS_LABELS[task.status])(),
			createdByEmail: task.createdByEmail,
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
		searchBy: 'title',
		create: () => this._open(),
		update: (row: Row) => this._open(row),
		delete: (row: Row) => this._confirmDelete(row),
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		// Stop listening for live changes when the page closes.
		inject(DestroyRef).onDestroy(() => this._store.stop());

		// The store is shared by both routes (and the dashboard form): drop what the other one loaded.
		this._store.tasks.set([]);

		void this._run(() => this._store.load(this._scope));
	}

	/** Reads the next page; the table search only covers the rows read so far. */
	loadMore(): void {
		void this._run(() => this._store.loadMore());
	}

	private _form(): FormInterface {
		const t = (text: string) => this._translate.translate(text)();

		return {
			formId: 'task',
			title: t('Tasks'),
			components: [
				{
					name: 'Input',
					key: 'title',
					focused: true,
					required: true,
					// The input does not draw a required marker by itself, so the label carries it.
					props: { label: `${t('Title')} *`, placeholder: t('Title') },
				},
				{
					name: 'Input',
					key: 'description',
					props: { label: t('Description'), placeholder: t('Description'), type: 'textarea' },
				},
				{
					name: 'Input',
					key: 'assignee',
					props: { label: t('Assignee'), placeholder: t('Assignee'), type: 'email' },
				},
				{ name: 'Input', key: 'dueDate', props: { label: t('Due date'), type: 'date' } },
				{
					name: 'Select',
					key: 'status',
					props: {
						label: t('Status'),
						placeholder: t('Status'),
						items: Object.entries(STATUS_LABELS).map(([_id, name]) => ({ _id, name })),
						bindLabel: 'name',
						bindValue: '_id',
					},
				},
			],
		};
	}

	private _open(row?: Row): void {
		const task = row ? this._store.tasks().find((item) => item.id === row.id) : undefined;
		const values: BosTask & { status: BosTaskStatus } = task
			? {
					title: task.title,
					description: task.description,
					assignee: task.assignee,
					dueDate: task.dueDate,
					status: task.status,
				}
			: { ...NEW_TASK, status: 'todo' };

		// The modal keeps one model per form id: start from this task, not from the last one opened.
		this._formService.reset('task', { ...values });

		this._formService.modal<Record<string, unknown>>(
			this._form(),
			{
				label: task ? 'Update' : 'Add',
				click: async (updated: unknown, close: () => void) => {
					const input = updated as Partial<BosTask> & { status?: string | null };
					const fields = this._fields(input);

					if (!fields.title.trim()) {
						this._alertService.error({ text: this._translate.translate('Enter the task title...')() });

						return;
					}

					const status: BosTaskStatus = input.status === 'in-progress' || input.status === 'done' ? input.status : 'todo';

					close();

					await this._run(() => (task ? this._store.update(task, fields, status) : this._store.create(fields, status).then(() => undefined)));
				},
			},
			{ ...values },
		);
	}

	private _fields(values: Partial<BosTask>): BosTask {
		return {
			title: String(values.title ?? ''),
			description: String(values.description ?? ''),
			assignee: String(values.assignee ?? ''),
			dueDate: String(values.dueDate ?? ''),
		};
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Delete this task?')(),
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
			this._errors.report(error, '[tasks]');
		}
	}
}
