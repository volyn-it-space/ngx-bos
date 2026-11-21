import { Component, computed, inject, signal } from '@angular/core';
import { form, submit } from '@angular/forms/signals';
import { AlertService, ButtonComponent, InputComponent } from '@wawjs/ngx-ui';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import {
	BosCustomerFields,
	FirebaseCustomersService,
	NEW_CUSTOMER,
} from '../../../../feature/firebase/firebase-customers.service';
import { customerSchema } from './customer.schema';
import { FirebaseErrorService } from '../../../../feature/firebase/firebase-errors';

@Component({
	selector: 'app-customer',
	imports: [ButtonComponent, InputComponent, TranslateDirective],
	templateUrl: './customer.component.html',
	styleUrl: './customer.component.scss',
})
export class CustomerComponent {
	private readonly _customersService = inject(FirebaseCustomersService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	readonly translateService = inject(TranslateService);

	readonly customerModel = signal<BosCustomerFields>({ ...NEW_CUSTOMER });

	readonly customerForm = form(this.customerModel, customerSchema);
	readonly saving = signal(false);
	readonly isSubmitDisabled = computed(() => this.customerForm().invalid() || this.saving());

	wFormSubmit() {
		submit(this.customerForm, async (field) => {
			this.saving.set(true);

			try {
				// The same Firestore customers that the Customers page and Analytics read.
				await this._customersService.create(field().value());

				this._alertService.success({
					text: this.translateService.translate('Customer has been created')(),
				});

				// Clear the form only after the customer was saved.
				this.customerModel.set({ ...NEW_CUSTOMER });
			} catch (error) {
				this._errors.report(error, '[customers]');
			} finally {
				this.saving.set(false);
			}

			return undefined;
		});
	}
}
