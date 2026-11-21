import { Routes } from '@angular/router';

/** Used by both `/customers` (an employee's own customers) and `/admin/customers` (all customers). */
export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./customers.component').then((m) => m.CustomersComponent),
	},
];
