import { Link } from 'react-router-dom';
import { mapsHref, smsHref, telHref } from '../../shared/links';
import { appointmentTemplateValues, fillTemplate, firstName } from '../../shared/templates';
import { useSettings } from '../hooks';
import { platform } from '../platform';
import { Icon } from './Icon';

type ActionName = 'directions' | 'call' | 'text' | 'onMyWay';

interface ContactActionsProps {
  clientId: number;
  clientName: string;
  phone: string | null;
  address: string | null;
  /** When given, "Text" prepares the reminder message for this cleaning. */
  appointment?: { date: string; time: string } | null;
  actions?: ActionName[];
  textLabel?: string;
}

/**
 * Directions / Call / Text / On My Way. These open the phone's own maps,
 * dialer and messaging apps with everything filled in. Nothing is sent
 * automatically: the user presses Send in their messaging app.
 */
export function ContactActions({
  clientId,
  clientName,
  phone,
  address,
  appointment,
  actions = ['directions', 'call', 'text', 'onMyWay'],
  textLabel = 'Text',
}: ContactActionsProps) {
  const { data: settings } = useSettings();
  const businessName = settings?.businessName ?? '';

  const reminder =
    appointment && settings
      ? fillTemplate(
          settings.reminderTemplate,
          appointmentTemplateValues({ clientName, date: appointment.date, time: appointment.time, businessName }),
        )
      : `Hi ${firstName(clientName)}, `;
  const onMyWay =
    settings && appointment
      ? fillTemplate(
          settings.onMyWayTemplate,
          appointmentTemplateValues({ clientName, date: appointment.date, time: appointment.time, businessName }),
        )
      : settings
        ? fillTemplate(settings.onMyWayTemplate, { client: firstName(clientName), date: '', time: '', business: businessName })
        : '';

  const links: Record<ActionName, { href: string | null; label: string; icon: 'map' | 'phone' | 'message' | 'car' }> = {
    directions: { href: mapsHref(address, platform), label: 'Directions', icon: 'map' },
    call: { href: telHref(phone), label: 'Call', icon: 'phone' },
    text: { href: smsHref(phone, reminder, platform), label: textLabel, icon: 'message' },
    onMyWay: { href: smsHref(phone, onMyWay, platform), label: 'On My Way', icon: 'car' },
  };

  const available = actions.filter((action) => links[action].href);
  const needsPhone = actions.some((action) => action !== 'directions') && !phone;
  const needsAddress = actions.includes('directions') && !address;

  return (
    <div className="contact-actions">
      {available.length > 0 && (
        <div className="action-grid">
          {available.map((action) => {
            const link = links[action];
            const external = action === 'directions';
            return (
              <a
                key={action}
                className={`btn btn-action action-${action}`}
                href={link.href!}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
              >
                <Icon name={link.icon} />
                {link.label}
              </a>
            );
          })}
        </div>
      )}
      {(needsPhone || needsAddress) && (
        <p className="missing-info">
          {needsPhone && needsAddress
            ? 'No phone number or address saved yet. '
            : needsPhone
              ? 'No phone number saved yet, so Call and Text are hidden. '
              : 'No address saved yet, so Directions is hidden. '}
          <Link to={`/clients/${clientId}?edit=1`}>Add {needsPhone && needsAddress ? 'them' : needsPhone ? 'a phone number' : 'an address'}</Link>
        </p>
      )}
    </div>
  );
}
