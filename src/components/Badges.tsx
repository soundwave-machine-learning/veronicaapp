import type { Appointment } from '../../shared/types';
import { PAYMENT_LABELS, STATUS_LABELS } from '../../shared/types';
import { Icon } from './Icon';

/** Status is always written out in words, with an icon, never color alone. */
export function StatusBadge({ status }: { status: Appointment['status'] }) {
  const icon = status === 'completed' ? 'check' : status === 'canceled' ? 'x' : 'clock';
  return (
    <span className={`badge badge-${status}`}>
      <Icon name={icon} size={16} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PaymentBadge({ appointment }: { appointment: Pick<Appointment, 'paymentStatus' | 'status' | 'priceCents'> }) {
  if (appointment.paymentStatus === 'paid') {
    return (
      <span className="badge badge-paid">
        <Icon name="dollar" size={16} />
        {PAYMENT_LABELS.paid}
      </span>
    );
  }
  // "Unpaid" only matters once the work is done and there is something to pay.
  if (appointment.status === 'completed' && appointment.priceCents !== null) {
    return (
      <span className="badge badge-unpaid">
        <Icon name="alert" size={16} />
        Not paid yet
      </span>
    );
  }
  return null;
}
