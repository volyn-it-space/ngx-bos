import {
	ApplicationConfig,
	inject,
	provideZonelessChangeDetection,
} from '@angular/core';
import {
	PreloadAllModules,
	provideRouter,
	withInMemoryScrolling,
	withPreloading,
} from '@angular/router';
import {
	provideNgxAce,
	registerAceMode,
	registerAceTheme,
} from '@wawjs/ngx-ace';
import { EmitterService, provideNgxCore } from '@wawjs/ngx-core';
import { provideNgxCrud } from '@wawjs/ngx-crud';
import { provideNgxHttp } from '@wawjs/ngx-http';
import { provideNgxSocket } from '@wawjs/ngx-socket';
import { provideNgxTinymce } from '@wawjs/ngx-tinymce';
import { provideTranslate } from '@wawjs/ngx-translate';
import {
	ModalService,
	provideNgxUi,
	provideStartup,
	provideStartupTask,
} from '@wawjs/ngx-ui';
import { ModalFormComponent, ModalUniqueComponent, NGX_FORM_CONFIG } from '@wawjs/ngx-form';
import { NgxBosConfig, UserService, ngxBosProvide } from '@wawjs/ngx-bos';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env';
import { provideFormComponents } from './app.formcomponents';
import { FirebaseAuthService } from './feature/firebase/firebase-auth.service';
import { FirebaseEmployeesService } from './feature/firebase/firebase-employees.service';
import { routes } from './app.routes';
import { tinymceConfig } from './tinymce.config';
import { wawjsConfig } from './wawjs.config';

registerAceMode('javascript', () =>
	import('ace-builds/src-noconflict/mode-javascript'),
);
registerAceTheme('clouds', () =>
	import('ace-builds/src-noconflict/theme-clouds'),
);
registerAceTheme('github', () =>
	import('ace-builds/src-noconflict/theme-github'),
);

/**
 * Socket.IO client, downloaded only when SocketService connects (nothing in the template uses it yet).
 * SocketService calls `io()` synchronously, so this returns a stand-in that queues `on`, `off` and
 * `emit` until the real socket exists, then forwards to it.
 */
function lazyIo(url: string, opts: object) {
	type Method = 'on' | 'off' | 'emit';
	let socket: import('socket.io-client').Socket | undefined;
	let closed = false;
	const queue: [Method, unknown[]][] = [];

	import('socket.io-client').then(({ io }) => {
		if (closed) return;

		socket = io(url, opts);
		queue.splice(0).forEach(([method, args]) => (socket![method] as (...a: unknown[]) => void)(...args));
	}).catch(() => undefined);

	const call =
		(method: Method) =>
		(...args: unknown[]) => {
			if (socket) (socket[method] as (...a: unknown[]) => void)(...args);
			else queue.push([method, args]);
		};

	return {
		on: call('on'),
		off: call('off'),
		emit: call('emit'),
		disconnect: () => {
			closed = true;
			queue.length = 0;
			socket?.disconnect();
		},
	};
}

/** `ua` for a device in Ukraine or set to Ukrainian, `en` for the rest of the world. */
function detectUkraine(): string {
	let timeZone = '';

	try {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		// no timezone information: fall through to the browser language
	}

	const inUkraine = ['Europe/Kyiv', 'Europe/Kiev', 'Europe/Uzhgorod', 'Europe/Zaporozhye'].includes(timeZone);
	const ukrainian = (navigator.languages?.length ? navigator.languages : [navigator.language])
		.some((language) => /^(uk|ua)\b/i.test(language ?? ''));

	return inUkraine || ukrainian ? 'ua' : 'en';
}

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		ngxBosProvide({
			appId: environment.appId,
			url: environment.url,
			roles: environment.roles,
			userFields:
				(environment as unknown as { userFields?: string[] })
					.userFields ?? [],
			userForm:
				(environment as unknown as {
					userForm?: NgxBosConfig['userForm'];
				}).userForm ?? [],
			defaultUserThumb: 'default.png',
		}),
		provideFormComponents(),
		provideNgxCore(wawjsConfig),
		provideNgxHttp(wawjsConfig),
		provideNgxCrud(wawjsConfig),
		provideNgxSocket({ ...wawjsConfig, io: lazyIo }),
		provideNgxAce({
			mode: 'text',
			theme: 'github',
			useWorker: false,
		}),
		provideTranslate({
			defaultLanguage: environment.defaultLanguageCode,
			languages: environment.languages,
			folder: '/i18n/',
			persistLanguage: true,
			// Ukrainian when the device is in Ukraine (timezone) or set to Ukrainian; English everywhere else.
			// A saved choice wins over this.
			detectLanguage: [detectUkraine],
		}),
		provideNgxUi(),
		// Startup screen (always shown, see index.html). It is released after the first render, which
		// already waits for the language (provideTranslate loads it in an app initializer); the saved
		// theme is applied before first paint in index.html. Add more waits with provideStartupTask().
		provideStartup(),
		// Signed-in user: UserService checks the saved session with the `me` API on start and emits
		// 'us.user' when it succeeds; an invalid session logs out and reloads. If the API is down,
		// stop waiting after 8s and open the app with the saved user.
		provideStartupTask('user', () => {
			inject(UserService);

			if (!localStorage.getItem('waw_user')) {
				return;
			}

			return firstValueFrom(
				inject(EmitterService).onComplete('us.user', { timeoutMs: 8000 }),
			).catch(() => undefined);
		}),
		// The roles shown in the app come from Firebase: admin from the restored Firebase sign-in, employee
		// from Firestore. Keep the startup screen up until both are known, but only for a saved session
		// (the Firebase SDK should not download for a visitor who is not signed in). Never block longer
		// than 8s; checkSelf() and watch() already swallow their own errors.
		provideStartupTask('roles', () => {
			if (!localStorage.getItem('waw_user')) {
				return;
			}

			const auth = inject(FirebaseAuthService);
			const employees = inject(FirebaseEmployeesService);

			return Promise.race([
				auth
					.watch()
					.catch(() => undefined)
					.then(() => employees.checkSelf()),
				new Promise<void>((resolve) => setTimeout(resolve, 8000)),
			]);
		}),
		// provideNgxForm() only supports static config; keep a factory so modal helpers get the injected ModalService.
		{
			provide: NGX_FORM_CONFIG,
			useFactory: (modalService: ModalService) => ({
				appId: environment.appId,
				modalService,
				// provideNgxForm() adds these defaults; a custom factory must pass them itself.
				modalFormComponent: ModalFormComponent,
				modalUniqueComponent: ModalUniqueComponent,
			}),
			deps: [ModalService],
		},
		provideNgxTinymce(tinymceConfig),
		provideRouter(
			routes,
			withPreloading(PreloadAllModules),
			withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
		),
	],
};
