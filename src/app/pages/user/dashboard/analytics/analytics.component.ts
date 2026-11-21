import { Component, computed, inject } from '@angular/core';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { FirebaseAuthService } from '../../../../feature/firebase/firebase-auth.service';
import { FirebaseCustomersService } from '../../../../feature/firebase/firebase-customers.service';
import { FirebaseOrdersService } from '../../../../feature/firebase/firebase-orders.service';
import { FirebaseTasksService } from '../../../../feature/firebase/firebase-tasks.service';

/** A period of the analytics: `from` is included, `to` is not. */
interface Period {
	key: string;
	label: string;
	from: Date;
	to: Date;
}

/** Monday 00:00 of the week that holds `date`. */
function startOfWeek(date: Date): Date {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const day = (start.getDay() + 6) % 7;

	start.setDate(start.getDate() - day);

	return start;
}

/** This week, last week, this month and last month (weeks start on Monday). */
function periods(now: Date): Period[] {
	const week = startOfWeek(now);
	const lastWeek = new Date(week);
	const nextWeek = new Date(week);
	const month = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

	lastWeek.setDate(week.getDate() - 7);
	nextWeek.setDate(week.getDate() + 7);

	return [
		{ key: 'this-week', label: 'This week', from: week, to: nextWeek },
		{ key: 'last-week', label: 'Last week', from: lastWeek, to: week },
		{ key: 'this-month', label: 'This month', from: month, to: nextMonth },
		{ key: 'last-month', label: 'Last month', from: lastMonth, to: month },
	];
}

/**
 * The Analytics tab of the dashboard: how many customers, orders and tasks were created in the current and the
 * previous week and month. Administrators count everyone's, an employee counts their own.
 */
@Component({
	selector: 'app-dashboard-analytics',
	imports: [TranslateDirective],
	templateUrl: './analytics.component.html',
})
export class DashboardAnalyticsComponent {
	private readonly _customers = inject(FirebaseCustomersService);
	private readonly _tasks = inject(FirebaseTasksService);
	private readonly _orders = inject(FirebaseOrdersService);
	private readonly _auth = inject(FirebaseAuthService);
	readonly translateService = inject(TranslateService);

	readonly cards = computed(() => {
		const customers = this._customers.customers();
		const tasks = this._tasks.tasks();
		const orders = this._orders.orders();

		return periods(new Date()).map((period) => {
			const within = (createdAt: string) => {
				const time = new Date(createdAt).getTime();

				return time >= period.from.getTime() && time < period.to.getTime();
			};
			const created = tasks.filter((task) => within(task.createdAt));

			return {
				key: period.key,
				label: period.label,
				customers: customers.filter((customer) => within(customer.createdAt)).length,
				orders: orders.filter((order) => within(order.createdAt)).length,
				tasks: created.length,
				done: created.filter((task) => task.status === 'done').length,
			};
		});
	});

	constructor() {
		const scope = this._auth.isAdmin() ? 'all' : 'mine';

		// The stores are shared with the list pages, which read them a page at a time; the counts need every
		// record of the scope, so they are read in full here.
		this._customers.customers.set([]);
		this._tasks.tasks.set([]);
		this._orders.orders.set([]);

		void this._customers.loadAll(scope).catch((error) => console.error('[analytics]', error));
		void this._tasks.loadAll(scope).catch((error) => console.error('[analytics]', error));
		void this._orders.loadAll(scope).catch((error) => console.error('[analytics]', error));
	}
}
