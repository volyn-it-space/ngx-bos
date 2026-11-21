import { Component, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonComponent, CellDirective, TableComponent } from '@wawjs/ngx-ui';
import { TranslateDirective } from '@wawjs/ngx-translate';
import {
	BosEmployeeRequest,
	FirebaseEmployeesService,
} from '../../../feature/firebase/firebase-employees.service';
import { FirebaseErrorService } from '../../../feature/firebase/firebase-errors';

/** A table row: the employee uid (also the document id), name and email. */
type Row = { id: string; name: string; email: string };

@Component({
	imports: [TableComponent, CellDirective, ButtonComponent, TranslateDirective],
	templateUrl: './roles.component.html',
})
export class RolesComponent {
	private readonly _store = inject(FirebaseEmployeesService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	private readonly _translate = inject(TranslateService);

	readonly columns = ['name', 'email'];

	readonly rows = computed<Row[]>(() =>
		this._store.employees().map((employee) => ({
			id: employee.uid,
			name: employee.name || employee.uid,
			email: employee.email,
		})),
	);

	/** People who asked for employee access; shown on top with Accept and Ignore. */
	readonly requests = computed(() =>
		this._store.requests().map((request) => ({
			uid: request.uid,
			name: request.name || request.uid,
			email: request.email,
		})),
	);

	readonly requestColumns = [
		{ title: 'Name', field: 'name' },
		{ title: 'Email', field: 'email' },
		{ title: '', field: 'actions' },
	];

	readonly requestConfig = {
		allDocs: true,
		perPage: 0,
		page: 1,
		buttons: [],
		headerButtons: [],
	};

	readonly failed = signal(false);

	readonly config = {
		allDocs: true,
		perPage: 50,
		page: 1,
		searchBy: 'name',
		delete: (row: Row) => this._confirmDelete(row),
		buttons: [],
		headerButtons: [],
	};

	constructor() {
		// Read again on every visit, so people who signed in since the last visit are listed.
		void this._run(() => this._store.reload());
	}

	accept(row: { uid: string }): void {
		const request = this._find(row.uid);

		if (request) void this._run(() => this._store.accept(request));
	}

	ignore(row: { uid: string }): void {
		void this._run(() => this._store.ignore(row.uid));
	}

	private _find(uid: string): BosEmployeeRequest | undefined {
		return this._store.requests().find((request) => request.uid === uid);
	}

	private _confirmDelete(row: Row): void {
		this._alertService.question({
			text: this._translate.translate('Remove this employee?')(),
			timeout: 0,
			progress: false,
			buttons: [
				{
					text: this._translate.translate('Remove')(),
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
			this._errors.report(error, '[employees]');
		}
	}
}
