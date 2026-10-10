export type ReminderSource = "text" | "voice";

export type Reminder = {
  id: string;
  title: string;
  note: string;
  dueAt?: string;
  completed: boolean;
  createdAt: string;
  source: ReminderSource;
  notificationId?: string;
};

export type ParsedReminder = {
  title: string;
  note: string;
  dueAt?: string;
};
