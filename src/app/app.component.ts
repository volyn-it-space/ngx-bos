import { Component, Injector, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserService } from '@wawjs/ngx-bos';

@Component({
	imports: [RouterOutlet],
	selector: 'app-root',
	templateUrl: './app.component.html',
})
export class AppComponent {
	private readonly _userService = inject(UserService);
	private readonly _injector = inject(Injector);
	private _firebaseStarted = false;

	constructor() {
		// Firebase starts only for a signed-in person: on start for a saved session, or right after
		// sign-in (the sign page loads the SDK itself for the Google popup). A visitor who is not signed
		// in never downloads it. The admin guard and the Firebase services call watch() themselves.
		effect(() => {
			if (!this._userService.user()._id || this._firebaseStarted) return;

			this._firebaseStarted = true;
			untracked(() => void this._startFirebase());
		});
	}

	private async _startFirebase(): Promise<void> {
		const [{ FirebaseAuthService }, { FirebaseProfileService }, { FirebaseTranslationsService }] =
			await Promise.all([
				import('./feature/firebase/firebase-auth.service'),
				import('./feature/firebase/firebase-profile.service'),
				import('./feature/firebase/firebase-translations.service'),
			]);

		// Restore the Firebase sign-in early, so admin links and pages know who is signed in.
		this._injector.get(FirebaseAuthService).watch().catch(() => undefined);

		// Apply the profile and settings saved in Firestore, and keep saving theme and language changes.
		// Its own effect loads it again when another Firebase account signs in later.
		void this._injector.get(FirebaseProfileService).load();

		// Custom translations from Firestore, laid over the translation files.
		void this._injector.get(FirebaseTranslationsService).load();
	}
}
