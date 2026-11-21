import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TabPanelComponent, TabsComponent } from '@wawjs/ngx-ui';
import { map } from 'rxjs';
import { DashboardAnalyticsComponent } from './analytics/analytics.component';
import { CustomerComponent } from './customer/customer.component';
import { DashboardOrderComponent } from './order/order.component';
import { DashboardProductComponent } from './product/product.component';
import { DashboardTaskComponent } from './task/task.component';
import { DASHBOARD_TABS, type DashboardView } from './dashboard.types';

@Component({
	templateUrl: './dashboard.component.html',
	styleUrl: './dashboard.component.scss',
	imports: [
		TabsComponent,
		TabPanelComponent,
		DashboardAnalyticsComponent,
		CustomerComponent,
		DashboardProductComponent,
		DashboardOrderComponent,
		DashboardTaskComponent,
	],
})
export class DashboardComponent {
	private readonly _route = inject(ActivatedRoute);
	private readonly _router = inject(Router);

	private readonly _tab = toSignal(this._route.queryParamMap.pipe(map((params) => params.get('tab'))), {
		initialValue: this._route.snapshot.queryParamMap.get('tab'),
	});

	readonly activeIndex = computed(() => {
		const index = DASHBOARD_TABS.indexOf((this._tab() ?? '') as DashboardView);

		return index === -1 ? 0 : index;
	});

	/** Only the open tab is rendered, so a tab loads its data when it is opened. */
	isOpen(tab: DashboardView): boolean {
		return DASHBOARD_TABS[this.activeIndex()] === tab;
	}

	/** The address keeps the current tab as `?tab=<key>`. */
	select(index: number): void {
		void this._router.navigate([], {
			relativeTo: this._route,
			queryParams: { tab: DASHBOARD_TABS[index] ?? DASHBOARD_TABS[0] },
			replaceUrl: true,
		});
	}
}
