import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsComponent } from '@wawjs/ngx-bos';
import { TabPanelComponent, TabsComponent } from '@wawjs/ngx-ui';
import { map } from 'rxjs';
import { TranslatesComponent } from '../translates/translates.component';
import { RolesComponent } from '../roles/roles.component';
import { CompanyGeneralComponent } from './company-general.component';

/** The tabs of the admin Settings page, in order. The address keeps the current one as `?tab=<key>`. */
const TABS = ['general', 'employees', 'forms', 'translations'] as const;
type Tab = (typeof TABS)[number];

@Component({
	imports: [NgComponentOutlet, TabsComponent, TabPanelComponent],
	templateUrl: './company.component.html',
	styleUrls: ['../../shared/page.scss', './company.component.scss'],
})
export class CompanyComponent {
	private readonly _route = inject(ActivatedRoute);
	private readonly _router = inject(Router);

	readonly general = CompanyGeneralComponent;
	readonly employees = RolesComponent;
	readonly forms = FormsComponent;
	readonly translations = TranslatesComponent;

	private readonly _tab = toSignal(
		this._route.queryParamMap.pipe(map((params) => params.get('tab'))),
		{ initialValue: this._route.snapshot.queryParamMap.get('tab') },
	);

	readonly activeIndex = computed(() => {
		const index = TABS.indexOf((this._tab() ?? '') as Tab);

		return index === -1 ? 0 : index;
	});

	/** Only the open tab is rendered, so a tab loads its data when it is opened. */
	isOpen(tab: Tab): boolean {
		return TABS[this.activeIndex()] === tab;
	}

	select(index: number): void {
		void this._router.navigate([], {
			relativeTo: this._route,
			queryParams: { tab: TABS[index] ?? TABS[0] },
			replaceUrl: true,
		});
	}
}
