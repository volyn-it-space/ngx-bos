import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FirebaseAuthService } from './firebase-auth.service';

/** Lets only the admins listed in `environment.admins` open a route; everyone else goes to the profile. */
export const adminGuard: CanActivateFn = async () => {
	const firebaseAuth = inject(FirebaseAuthService);
	const router = inject(Router);

	// The saved Firebase sign-in restores asynchronously after a reload, so wait for it.
	await firebaseAuth.watch().catch(() => undefined);

	return firebaseAuth.isAdmin() ? true : router.parseUrl('/profile');
};
