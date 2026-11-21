import {
	ApplicationRef,
	EnvironmentInjector,
	EnvironmentProviders,
	Type,
	createComponent,
	inject,
	makeEnvironmentProviders,
	provideAppInitializer,
} from '@angular/core';
import { FormInterface } from '@wawjs/ngx-form';
import { provideStartupTask } from '@wawjs/ngx-ui';
import {
	FORM_COMPONENTS as NGX_BOS_FORM_COMPONENTS,
	FORM_COMPONENT_FORM as NGX_BOS_FORM_COMPONENT_FORM,
	FORM_TEMPLATE_COMPONENTS as NGX_BOS_FORM_TEMPLATE_COMPONENTS,
} from '@wawjs/ngx-bos';

export const FORM_COMPONENTS = [
	...NGX_BOS_FORM_COMPONENTS,
	/* addComponentNames */
];

export const FORM_COMPONENT_FORM = (key: string): FormInterface => {
	return (
		{
			/* addComponentForms */
		}[key] || NGX_BOS_FORM_COMPONENT_FORM(key)
	) as FormInterface;
};

/** Template components registered at startup (they are part of the main bundle). */
export const FORM_TEMPLATE_COMPONENTS: Record<string, Type<unknown>> = {
	...NGX_BOS_FORM_TEMPLATE_COMPONENTS,
	/* addComponents */
};

/**
 * Template components loaded in their own chunk. A name listed here wins over the same name in
 * FORM_TEMPLATE_COMPONENTS. Forms pick a template up as soon as it is registered, and the startup
 * screen waits for these, so the first form already has them.
 */
export const FORM_TEMPLATE_LOADERS: Record<string, () => Promise<Type<unknown>>> = {
	/* addLazyComponents */
};

/** Renders a template component once, off-screen, so it registers its template with FormService. */
function registerTemplate(
	cmp: Type<unknown>,
	injector: EnvironmentInjector,
	appRef: ApplicationRef,
): void {
	const ref = createComponent(cmp, { environmentInjector: injector });

	appRef.attachView(ref.hostView);
	(ref.hostView as { detectChanges?: () => void }).detectChanges?.();
}

export const provideFormComponents = (): EnvironmentProviders => {
	return makeEnvironmentProviders([
		provideAppInitializer(() => {
			const injector = inject(EnvironmentInjector);
			const appRef = inject(ApplicationRef);

			// FormService keeps the first template per name, so skip the names that load lazily.
			Object.entries(FORM_TEMPLATE_COMPONENTS)
				.filter(([name]) => !FORM_TEMPLATE_LOADERS[name])
				.forEach(([, cmp]) => registerTemplate(cmp, injector, appRef));
		}),
		provideStartupTask('form-templates', () => {
			const injector = inject(EnvironmentInjector);
			const appRef = inject(ApplicationRef);

			return Promise.all(
				Object.values(FORM_TEMPLATE_LOADERS).map((load) =>
					load().then((cmp) => registerTemplate(cmp, injector, appRef)),
				),
			).catch(() => undefined);
		}),
	]);
};
