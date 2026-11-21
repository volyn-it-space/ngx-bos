import {
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { InputComponent, MaterialComponent } from '@wawjs/ngx-ui';
import { FileComponent } from '@wawjs/ngx-bos';
import { UserService } from '@wawjs/ngx-bos';
import { EmitterService } from '@wawjs/ngx-core';
import { TranslateService } from '@wawjs/ngx-translate';
import { FirebaseProfileService } from '../../../feature/firebase/firebase-profile.service';
import { ProfileModel } from './profile.interface';
import { profileSchema } from './profile.schema';

@Component({
	imports: [
		InputComponent,
		FileComponent,
		MaterialComponent,
	],
	templateUrl: './profile.component.html',
	styleUrl: './profile.component.scss',
})
export class ProfileComponent {
	readonly userService = inject(UserService);
	readonly translateService = inject(TranslateService);
	private readonly _emitterService = inject(EmitterService);
	private readonly _profileStore = inject(FirebaseProfileService);

	private readonly _initialProfile = computed<ProfileModel>(() => {
		const u = this.userService.user();
		return {
			name: u.name || '',
			phone: u.phone || '',
			bio: u.bio || '',
		};
	});

	readonly profileModel = signal<ProfileModel>(this._initialProfile());
	readonly profileForm = form(this.profileModel, profileSchema);

	/** The values last saved (or loaded), so only real edits start the timer. */
	private _saved = JSON.stringify(this.profileModel());


	constructor() {
		// Show what is saved in Firestore once it has been read.
		this._profileStore.loaded().then(() => this._reset());

		this._emitterService
			.onComplete('us.user')
			.pipe(takeUntilDestroyed())
			.subscribe(() => this._reset());

		// Save two seconds after the last edit.
		effect((onCleanup) => {
			const model = this.profileModel();

			if (JSON.stringify(model) === this._saved) return;

			const timer = setTimeout(() => this._save(model), 2000);

			onCleanup(() => clearTimeout(timer));
		});

		// Leaving the page within the two seconds must not lose the edit.
		inject(DestroyRef).onDestroy(() => this._save(this.profileModel()));
	}

	private _reset(): void {
		this.profileModel.set(this._initialProfile());
		this.profileForm().reset();
		this._saved = JSON.stringify(this.profileModel());
	}

	private _save(model: ProfileModel): void {
		if (JSON.stringify(model) === this._saved) return;

		this._saved = JSON.stringify(model);
		this.userService.user.set({ ...this.userService.user(), ...model });
		this.userService.updateMe();
		this._profileStore.save(model).catch(() => undefined);
	}

	updateThumb(thumb: string): void {
		this.userService.user.set({
			...this.userService.user(),
			thumb,
		});

		this.userService.updateMe();
		this._profileStore.save({ thumb }).catch(() => undefined);
	}
}
