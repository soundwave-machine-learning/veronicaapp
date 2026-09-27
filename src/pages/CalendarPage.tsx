import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Appointment } from '../../shared/types';
import {
  addDays,
  addMonths,
  formatDateFriendly,
  formatMonthYear,
  formatTime,
  formatWeekRange,
  formatDateShort,
  formatMonthDay,
  formatWeekday,
  isValidDate,
  monthGrid,
  weekDays,
} from '../../shared/dates';
import { AppointmentList } from '../components/AppointmentList';
import { Icon } from '../components/Icon';
import { useQuickAdd } from '../components/QuickAdd';
import { ErrorState, Loading } from '../components/States';
import { useAppointments, useToday } from '../hooks';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_CHIPS = 3;

type View = 'month' | 'week';

export function CalendarPage() {
  const today = useToday();
  const addCleaning = useQuickAdd();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'week' ? 'week' : 'month';
  const dateParam = params.get('date');
  const selected = dateParam && isValidDate(dateParam) ? dateParam : today;

  const go = (next: { view?: View; date?: string }) => {
    const search = new URLSearchParams(params);
    if (next.view) search.set('view', next.view);
    if (next.date) search.set('date', next.date);
    setParams(search, { replace: true });
  };

  const weeks = useMemo(() => monthGrid(selected), [selected]);
  const days = useMemo(() => weekDays(selected), [selected]);
  const from = view === 'month' ? weeks[0][0] : days[0];
  const to = view === 'month' ? weeks[weeks.length - 1][6] : days[6];
  const appointments = useAppointments(from, to);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments.data ?? []) {
      const list = map.get(appointment.date) ?? [];
      list.push(appointment);
      map.set(appointment.date, list);
    }
    return map;
  }, [appointments.data]);

  const step = (direction: 1 | -1) =>
    go({ date: view === 'month' ? addMonths(selected, direction) : addDays(selected, 7 * direction) });

  const title = view === 'month' ? formatMonthYear(selected) : formatWeekRange(selected);

  return (
    <div className="page page-calendar">
      <header className="calendar-header">
        <h1 className="page-title calendar-title" aria-live="polite">
          {title}
        </h1>
        <div className="calendar-controls">
          <div className="button-group" role="group" aria-label="Move through the calendar">
            <button type="button" className="btn btn-secondary" onClick={() => step(-1)}>
              <Icon name="back" />
              Previous
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => go({ date: today })}>
              Today
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => step(1)}>
              Next
              <Icon name="forward" />
            </button>
          </div>
          <div className="segmented" role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'month'} onClick={() => go({ view: 'month' })}>
              Month
            </button>
            <button type="button" aria-pressed={view === 'week'} onClick={() => go({ view: 'week' })}>
              Week
            </button>
          </div>
        </div>
      </header>

      {appointments.isError && <ErrorState error={appointments.error} onRetry={() => appointments.refetch()} />}

      {view === 'month' ? (
        <div className="calendar-layout">
          <div className="month-wrap">
            <table className="month-grid">
              <caption className="visually-hidden">{title}. Choose a day to see its cleanings.</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((day) => (
                    <th key={day} scope="col">
                      <abbr title={day} className="weekday-long">
                        {day.slice(0, 3)}
                      </abbr>
                      <abbr title={day} className="weekday-short">
                        {day.slice(0, 1)}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]}>
                    {week.map((date) => (
                      <MonthCell
                        key={date}
                        date={date}
                        appointments={byDate.get(date) ?? []}
                        isToday={date === today}
                        isSelected={date === selected}
                        inMonth={date.slice(0, 7) === selected.slice(0, 7)}
                        onSelect={() => go({ date })}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {appointments.isPending && <Loading />}
          </div>

          <section className="card day-panel" aria-labelledby="day-panel-title">
            <h2 id="day-panel-title" className="day-panel-title">
              {formatDateFriendly(selected)}
              {selected === today && <span className="badge badge-today">Today</span>}
            </h2>
            <AppointmentList appointments={byDate.get(selected) ?? []} emptyMessage="No cleanings on this day." />
            <button type="button" className="btn btn-primary btn-large btn-block" onClick={() => addCleaning({ date: selected })}>
              <Icon name="plus" />
              Add Cleaning on {formatDateShort(selected)}
            </button>
          </section>
        </div>
      ) : (
        <div className="week-grid">
          {appointments.isPending && <Loading />}
          {days.map((date) => {
            const list = byDate.get(date) ?? [];
            return (
              <section key={date} className={`week-day${date === today ? ' is-today' : ''}`} aria-label={formatDateFriendly(date)}>
                <h2 className="week-day-title">
                  <span className="week-day-name">{formatWeekday(date)}</span>
                  <span className="week-day-date">{formatMonthDay(date)}</span>
                  {date === today && <span className="badge badge-today">Today</span>}
                </h2>
                {list.length ? (
                  <ul className="week-list">
                    {list.map((appointment) => (
                      <li key={appointment.id}>
                        <Link to={`/appointments/${appointment.id}`} className={`week-item status-${appointment.status}`}>
                          <span className="week-item-time">{formatTime(appointment.time)}</span>
                          <span className="week-item-name">{appointment.client.name}</span>
                          {appointment.status !== 'scheduled' && (
                            <span className="week-item-status">
                              <Icon name={appointment.status === 'completed' ? 'check' : 'x'} size={16} />
                              {appointment.status === 'completed' ? 'Completed' : 'Canceled'}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="week-empty">No cleanings</p>
                )}
                <button type="button" className="btn btn-quiet btn-small week-add" onClick={() => addCleaning({ date })}>
                  <Icon name="plus" size={18} />
                  Add Cleaning
                </button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MonthCellProps {
  date: string;
  appointments: Appointment[];
  isToday: boolean;
  isSelected: boolean;
  inMonth: boolean;
  onSelect: () => void;
}

function MonthCell({ date, appointments, isToday, isSelected, inMonth, onSelect }: MonthCellProps) {
  // Canceled cleanings stay in the day list but don't crowd the month grid.
  const visible = appointments.filter((a) => a.status !== 'canceled');
  const count = visible.length;
  const label = `${formatDateFriendly(date)}${isToday ? ' (today)' : ''}: ${
    count === 0 ? 'no cleanings' : `${count} ${count === 1 ? 'cleaning' : 'cleanings'}`
  }`;
  return (
    <td
      className={`month-cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${inMonth ? '' : ' is-outside'}`}
      onClick={onSelect}
    >
      <button type="button" className="month-day" aria-label={label} aria-pressed={isSelected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <span className="month-day-number">{Number(date.slice(8))}</span>
        {isToday && <span className="month-today-label">Today</span>}
      </button>
      {count > 0 && (
        <span className="month-count" aria-hidden="true">
          {count}
        </span>
      )}
      <ul className="month-chips">
        {visible.slice(0, MAX_CHIPS).map((appointment) => (
          <li key={appointment.id}>
            <Link
              to={`/appointments/${appointment.id}`}
              className={`month-chip status-${appointment.status}`}
              title={`${formatTime(appointment.time)} ${appointment.client.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="month-chip-time">{formatTime(appointment.time).replace(':00', '')}</span>{' '}
              <span className="month-chip-name">{appointment.client.name}</span>
              {appointment.status === 'completed' && <span className="visually-hidden"> (completed)</span>}
            </Link>
          </li>
        ))}
        {count > MAX_CHIPS && <li className="month-more">+{count - MAX_CHIPS} more</li>}
      </ul>
    </td>
  );
}
