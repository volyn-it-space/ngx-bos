import { Component, computed, effect, inject, signal } from '@angular/core';
import { form, required, schema, submit } from '@angular/forms/signals';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonComponent, InputComponent } from '@wawjs/ngx-ui';
import {
	BosCompany,
	FirebaseCompanyService,
	NEW_COMPANY,
} from '../../../feature/firebase/firebase-company.service';
import { FirebaseErrorService } from '../../../feature/firebase/firebase-errors';

const companySchema = schema<BosCompany>((path) => {
	required(path.name, { message: 'Enter the company name...' });
});

/** The General tab: general information about the company. */
@Component({
	selector: 'app-company-general',
	imports: [ButtonComponent, InputComponent, TranslateDirective],
	templateUrl: './company-general.component.html',
})
export class CompanyGeneralComponent {
	private readonly _store = inject(FirebaseCompanyService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	readonly translateService = inject(TranslateService);

	readonly companyModel = signal<BosCompany>({ ...NEW_COMPANY });
	readonly companyForm = form(this.companyModel, companySchema);
	readonly saving = signal(false);
	readonly isSubmitDisabled = computed(() => this.companyForm().invalid() || this.saving());

	constructor() {
		// Fill the form with what is saved, once it was read.
		effect(() => this.companyModel.set({ ...this._store.company() }));

		void this._store.load().catch((error) => {
			this._errors.report(error, '[company]');
		});
	}

	wFormSubmit() {
		submit(this.companyForm, async (field) => {
			this.saving.set(true);

			try {
				await this._store.save(field().value());

				this._alertService.success({
					text: this.translateService.translate('Company information has been saved')(),
				});
			} catch (error) {
				this._errors.report(error, '[company]');
			} finally {
				this.saving.set(false);
			}

			return undefined;
		});
	}
}
