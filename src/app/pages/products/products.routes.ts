import { Routes } from '@angular/router';

/** Used by both `/products` (an employee's own products) and `/admin/products` (all products). */
export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./products.component').then((m) => m.ProductsComponent),
	},
];
