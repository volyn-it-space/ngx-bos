import { Component, computed, inject, signal } from '@angular/core';
import { form, required, schema, submit } from '@angular/forms/signals';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonComponent, InputComponent } from '@wawjs/ngx-ui';
import { FirebaseProductsService } from '../../../../feature/firebase/firebase-products.service';
import { FirebaseErrorService } from '../../../../feature/firebase/firebase-errors';

/** What the form holds: the price is text while it is typed. */
interface ProductForm {
	name: string;
	sku: string;
	price: string;
	description: string;
}

const NEW_PRODUCT_FORM: ProductForm = { name: '', sku: '', price: '', description: '' };

const productSchema = schema<ProductForm>((path) => {
	required(path.name, { message: 'Enter the product name...' });
});

@Component({
	selector: 'app-dashboard-product',
	imports: [ButtonComponent, InputComponent, TranslateDirective],
	templateUrl: './product.component.html',
})
export class DashboardProductComponent {
	private readonly _productsService = inject(FirebaseProductsService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	readonly translateService = inject(TranslateService);

	readonly productModel = signal<ProductForm>({ ...NEW_PRODUCT_FORM });

	readonly productForm = form(this.productModel, productSchema);
	readonly saving = signal(false);
	readonly isSubmitDisabled = computed(() => this.productForm().invalid() || this.saving());

	wFormSubmit() {
		submit(this.productForm, async (field) => {
			this.saving.set(true);

			try {
				const value = field().value();

				await this._productsService.create({
					name: value.name,
					sku: value.sku,
					price: Number(value.price) || 0,
					description: value.description,
				});

				this._alertService.success({
					text: this.translateService.translate('Product has been created')(),
				});

				// Clear the form only after the product was saved.
				this.productModel.set({ ...NEW_PRODUCT_FORM });
			} catch (error) {
				this._errors.report(error, '[products]');
			} finally {
				this.saving.set(false);
			}

			return undefined;
		});
	}
}
