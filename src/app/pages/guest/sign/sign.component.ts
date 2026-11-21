import {
	Component,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import {
	form,
	pattern,
	required,
	schema,
	submit,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { environment } from '@env';
import { SpiderComponent } from '@wawjs/ngx-bos';
import {
	AlertService,
	ButtonComponent,
	InputComponent,
	ThemeComponent,
	ThemeService,
} from '@wawjs/ngx-ui';
import { User, UserService } from '@wawjs/ngx-bos';
import { HttpService } from '@wawjs/ngx-http';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { RespStatus, SignModel } from './sign.interface';

const signSchema = schema<SignModel>((path) => {
	required(path.email, { message: 'Введіть email...' });

	pattern(path.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);

	required(path.password, { message: 'Введіть пароль...' });
});

@Component({
	imports: [
		SpiderComponent,
		InputComponent,
		ButtonComponent,
		ThemeComponent,
		TranslateDirective,
	],
	templateUrl: './sign.component.html',
})
export class SignComponent {
	themeService = inject(ThemeService);
	userService = inject(UserService);
	readonly translateService = inject(TranslateService);
	private _alertService = inject(AlertService);
	private _httpService = inject(HttpService);
	private _router = inject(Router);

	readonly logo = environment.sign.logo;

	// Signal form model
	signModel = signal<SignModel>({
		email: environment.sign.email,
		password: environment.sign.password,
		resetPin: '',
	});

	// Signal form tree (used by [field])
	signForm = form(this.signModel, signSchema);

	/**
	 * Where the form is:
	 * - `credentials`: email and password, the first step.
	 * - `create`: the email has no account; the next submit creates one.
	 * - `reset`: a code was mailed; the form takes the code and a new password.
	 */
	readonly step = signal<'credentials' | 'create' | 'reset'>('credentials');
	readonly showCode = computed(() => this.step() === 'reset');
	/** True after the password was rejected, until the email or password changes. */
	readonly wrongPassword = signal(false);
	readonly isSubmitting = signal(false);
	readonly submitLabel = computed(() => {
		switch (this.step()) {
			case 'create':
				return 'Створити обліковий запис';
			case 'reset':
				return 'Змінити пароль';
			default:
				return "Почати";
		}
	});

	/** Email and password the server last answered for; editing either starts over. */
	private _checkedEmail = '';
	private _checkedPassword = '';

	constructor() {
		effect(() => {
			const { email, password } = this.signModel();

			if (email !== this._checkedEmail) {
				this.step.set('credentials');
				this.wrongPassword.set(false);
			} else if (password !== this._checkedPassword) {
				this.wrongPassword.set(false);
			}
		});
	}

	readonly isSubmitDisabled = computed(() => {
		if (this.isSubmitting()) {
			return true;
		}

		const formInvalid = this.signForm().invalid();

		if (!this.showCode()) {
			return formInvalid;
		}

		const resetPinField = this.signForm.resetPin();
		return formInvalid || resetPinField.invalid();
	});

	wFormSubmit() {
		submit(this.signForm, (formTree) => {
			const payload = formTree().value() as SignModel;

			switch (this.step()) {
				case 'reset':
					this._change(payload);
					break;
				case 'create':
					this.isSubmitting.set(true);
					this._sign(payload);
					break;
				default:
					this._submit(payload);
			}

			return Promise.resolve({} as any);
		});
	}

	private _submit(payload: SignModel) {
		this.isSubmitting.set(true);
		this._checkedEmail = payload.email;
		this._checkedPassword = payload.password;
		this._httpService.post(
			'/api/user/status',
			payload,
			(resp: RespStatus) => {
				if (resp.email && resp.pass) {
					this._login(payload);
					return;
				}

				this.isSubmitting.set(false);

				// Nothing is sent or created without a second, explicit action: a wrong password
				// offers a reset code, an unknown email offers to create the account.
				if (resp.email) this.wrongPassword.set(true);
				else this.step.set('create');
			},
			this._handleRequestError.bind(this),
		);
	}

	/** Mails a reset code for the entered email, then asks for the code and a new password. */
	requestReset(): void {
		if (this.isSubmitting()) return;

		this.isSubmitting.set(true);
		this._request(this.signModel());
	}

	private _login(payload: SignModel) {
		this._httpService.post(
			'/api/user/login',
			payload,
			this._set.bind(this),
			this._handleRequestError.bind(this),
		);
	}

	private _sign(payload: SignModel) {
		this._httpService.post(
			'/api/user/sign',
			payload,
			this._set.bind(this),
			this._handleRequestError.bind(this),
		);
	}

	private _request(payload: SignModel) {
		this._checkedEmail = payload.email;
		this._httpService.post('/api/user/request', payload, () => {
			this.isSubmitting.set(false);
			this.wrongPassword.set(false);
			this.step.set('reset');

			this._alertService.info({
				text: this.translateService.translate('Лист буде надіслано на ваш email')(),
			});
		}, this._handleRequestError.bind(this));
	}

	private _change(payload: SignModel) {
		this.isSubmitting.set(true);
		this._httpService.post('/api/user/change', payload, (resp: boolean) => {
			if (!resp) {
				this.isSubmitting.set(false);
				this._alertService.error({
					text: this.translateService.translate('Неправильний код')(),
				});
				return;
			}

			this._alertService.info({
				text: this.translateService.translate('Пароль успішно змінено')(),
			});

			this._login(payload);
		}, this._handleRequestError.bind(this));
	}

	private _set(user: User) {
		if (!user) {
			this.isSubmitting.set(false);
			this._alertService.error({
				text: this.translateService.translate('Щось пішло не так')(),
			});
			return;
		}

		const token = (user as unknown as { token: string }).token || '';
		if (token) this._httpService.set('token', token);

		// setUser() persists the user to localStorage.
		this.userService.setUser(user);
		this.userService.get();
		this._router.navigateByUrl('/profile');
	}

	private _handleRequestError(): void {
		this.isSubmitting.set(false);
		this._alertService.error({
			text: this.translateService.translate('Щось пішло не так')(),
		});
	}
}
