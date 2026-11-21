import { Routes } from '@angular/router';

/** Used by both `/orders` (an employee's own orders) and `/admin/orders` (all orders). */
export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./orders.component').then((m) => m.OrdersComponent),
	},
];
