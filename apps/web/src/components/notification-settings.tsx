import { useCallback, useState } from "react";

import { useReminderDelivery } from "@/hooks/use-reminder-delivery";
import {
  calculateReminderSchedule,
  readNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/notifications";
import type {
  NotificationPreferences,
  ReminderLeadDays,
} from "@/lib/notifications";
import { formatCollectionDate } from "@/lib/schedule";
import type { ScheduleResponse } from "@/lib/schedule";

const readDeviceTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const describeReminderDelivery = (
  enabled: boolean,
  deliveryActive: boolean
): string => {
  if (!enabled) {
    return "Reminders are off. Enabling them asks for browser permission and saves a push subscription.";
  }
  if (deliveryActive) {
    return "Your reminder subscription is active. Delivery is checked every five minutes; push timing also depends on your browser and platform.";
  }
  return "Reminders are on in this browser; server delivery status is being checked or needs attention.";
};

const leadDaysFromValue = (value: string): ReminderLeadDays => {
  switch (value) {
    case "0": {
      return 0;
    }
    case "2": {
      return 2;
    }
    case "7": {
      return 7;
    }
    default: {
      return 1;
    }
  }
};

const describePermission = (
  permission: string,
  enabled: boolean,
  storageAvailable: boolean
): string => {
  if (permission === "unsupported") {
    return "This browser does not support web notifications.";
  }
  if (permission === "insecure") {
    return "Notifications require a secure HTTPS connection.";
  }
  if (permission === "denied") {
    return "Notifications are blocked. Change this site's permission in browser settings.";
  }
  if (permission === "granted") {
    return "Browser notification permission is granted.";
  }
  if (!storageAvailable) {
    return "Your reminder preference could not be saved on this device.";
  }
  return enabled
    ? "Your reminder preference is saved on this device."
    : "Turn reminders on to choose your reminder settings.";
};

/** Render consent, schedule, and delivery status for bin-day reminders. */
export const NotificationSettings = ({
  schedule,
  cancelMissingSchedule,
}: {
  readonly schedule: ScheduleResponse | null;
  readonly cancelMissingSchedule: boolean;
}) => {
  const [preferences, setPreferences] = useState(readNotificationPreferences);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const save = useCallback((next: NotificationPreferences) => {
    setPreferences(next);
    const saved = saveNotificationPreferences(next);
    setStorageAvailable(saved);
    return saved;
  }, []);
  const {
    deliveryActive,
    deliveryMessage,
    disableReminders,
    enableReminders,
    permission,
  } = useReminderDelivery(schedule, cancelMissingSchedule, preferences, save);
  const timeZone = readDeviceTimeZone();
  const reminder = schedule
    ? calculateReminderSchedule(
        schedule.nextCollection.date,
        preferences,
        timeZone
      )
    : null;
  const reminderStatus = describeReminderDelivery(
    preferences.enabled,
    deliveryActive
  );

  return (
    <section
      aria-labelledby="notification-settings-title"
      className="border-paper-border bg-surface mx-auto mb-8 w-full max-w-6xl rounded-2xl border p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2
            className="text-lg font-semibold"
            id="notification-settings-title"
          >
            Bin-day reminders
          </h2>
          <p className="text-copy-muted mt-2 text-sm leading-6">
            Choose when you would like a reminder. When you turn reminders on,
            this app asks for notification permission and sends the push
            subscription, schedule dates, timezone, and reminder settings to the
            delivery service. Your street address is never stored there. A copy
            of the opaque push endpoint stays in this browser so the service
            subscription can still be removed if the browser no longer reports
            it.
          </p>
        </div>
        <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-3 font-semibold">
          <input
            checked={preferences.enabled}
            className="accent-forest size-5"
            onChange={(event) => {
              if (event.target.checked) {
                void enableReminders();
              } else {
                void disableReminders();
              }
            }}
            type="checkbox"
          />
          Reminders {preferences.enabled ? "on" : "off"}
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Remind me
          <select
            className="border-sage-border bg-panel text-ink mt-2 min-h-11 w-full rounded-xl border px-3"
            disabled={!preferences.enabled}
            onChange={(event) => {
              const saved = save({
                ...preferences,
                leadDays: leadDaysFromValue(event.target.value),
              });
              if (!saved && preferences.enabled) {
                void disableReminders();
              }
            }}
            value={String(preferences.leadDays)}
          >
            <option value="0">On collection day</option>
            <option value="1">The day before</option>
            <option value="2">2 days before</option>
            <option value="7">A week before</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          At my local time
          <input
            className="border-sage-border bg-panel text-ink mt-2 min-h-11 w-full rounded-xl border px-3"
            disabled={!preferences.enabled}
            onChange={(event) => {
              if (event.target.value) {
                const saved = save({
                  ...preferences,
                  localTime: event.target.value,
                });
                if (!saved && preferences.enabled) {
                  void disableReminders();
                }
              } else {
                event.currentTarget.value = preferences.localTime;
              }
            }}
            required
            type="time"
            value={preferences.localTime}
          />
        </label>
      </div>

      {reminder && (
        <p className="bg-panel mt-4 rounded-xl p-4 text-sm">
          Planned reminder: {formatCollectionDate(reminder.scheduledLocalDate)}
          at {reminder.scheduledLocalTime} ({reminder.timeZone}).
        </p>
      )}

      <div aria-live="polite" className="bg-panel mt-5 rounded-xl p-4 text-sm">
        <output className="block">{reminderStatus}</output>
        {!storageAvailable && (
          <output className="block">
            This browser blocked local storage, so your preference could not be
            saved.
          </output>
        )}
        <output className="block">
          {describePermission(
            permission,
            preferences.enabled,
            storageAvailable
          )}
        </output>
        {deliveryMessage && (
          <output className="block">{deliveryMessage}</output>
        )}
      </div>

      <p className="text-copy-muted mt-3 text-xs leading-5">
        iPhone and iPad web push is available only in a supported, installed
        Home Screen app. Browser permission may also need to be changed in
        browser settings when reminders are turned off.
      </p>
    </section>
  );
};
