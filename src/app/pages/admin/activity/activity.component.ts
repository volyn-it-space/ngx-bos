import { Component, computed, inject } from '@angular/core';
import { TranslateService } from '@wawjs/ngx-translate';
import { TableComponent } from '@wawjs/ngx-ui';
import { FirebaseActivityService } from '../../../feature/firebase/firebase-activity.service';
import { activityRow } from '../../shared/activity-format';
import { FirebaseErrorService } from '../../../feature/firebase/firebase-errors';

/**
 * The activity log: who created, updated or deleted what, newest first, for everyone. It lists the same
 * table as the notifications (an entry that touches another person also shows who was notified).
 */
@Component({
	imports: [TableComponent],
	templateUrl: './activity.component.html',
})
export class ActivityComponent {
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
			{ title: t('Notified'), field: 'notified' },
		];
	});

	readonly rows = computed(() => this._store.entries().map((entry) => activityRow(entry, this._translate)));

	readonly config = {
		allDocs: true,
		perPage: 50,
		page: 1,
		searchable: true,
		searchBy: 'title',
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		this._store.entries.set([]);

		void this._store.loadAll().catch((error) => {
			this._errors.report(error, '[activity]');
		});
	}
}
