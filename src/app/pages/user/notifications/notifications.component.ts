import { Component, DestroyRef, computed, inject } from '@angular/core';
import { TranslateService } from '@wawjs/ngx-translate';
import { TableComponent } from '@wawjs/ngx-ui';
import { FirebaseActivityService } from '../../../feature/firebase/firebase-activity.service';
import { activityRow, type ActivityRow } from '../../shared/activity-format';
import { FirebaseErrorService } from '../../../feature/firebase/firebase-errors';

/**
 * The notifications of the signed-in person: what others did that touches them (for example a task made
 * for them), newest first, with a way to mark them read.
 */
@Component({
	imports: [TableComponent],
	templateUrl: './notifications.component.html',
})
export class NotificationsComponent {
	private readonly _store = inject(FirebaseActivityService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	readonly columns = computed(() => {
		const t = (text: string) => this._translate.translate(text)();

		return [
			{ title: t('When'), field: 'time' },
			{ title: t('Who'), field: 'who' },
			{ title: t('Action'), field: 'action' },
			{ title: t('What'), field: 'what' },
			{ title: t('Title'), field: 'title' },
			{ title: t('Status'), field: 'status' },
		];
	});

	readonly rows = computed(() => this._store.entries().map((entry) => activityRow(entry, this._translate)));

	readonly config = {
		allDocs: true,
		perPage: 50,
		page: 1,
		searchable: true,
		searchBy: 'title',
		buttons: [{ icon: 'done', click: (row: ActivityRow) => void this._run(() => this._store.markRead(row.id)) }],
		headerButtons: [
			{
				icon: 'done_all',
				text: this._translate.translate('Mark all as read')(),
				click: () => void this._run(() => this._store.markAllRead()),
			},
		],
	};

	constructor() {
		// Stop listening for live changes when the page closes.
		inject(DestroyRef).onDestroy(() => this._store.stop());

		this._store.entries.set([]);

		void this._run(() => this._store.loadMine());
	}

	private async _run(job: () => Promise<void>): Promise<void> {
		try {
			await job();
		} catch (error) {
			this._errors.report(error, '[notifications]');
		}
	}
}
