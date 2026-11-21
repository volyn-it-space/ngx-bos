import { required, schema } from '@angular/forms/signals';
import type { BosCustomerFields } from '../../../../feature/firebase/firebase-customers.service';

export const customerSchema = schema<BosCustomerFields>((path) => {
	required(path.name, { message: 'Enter the customer name...' });
});
