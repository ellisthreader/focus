import test from "node:test";
import assert from "node:assert/strict";

import {
  AssistantActionValidationError,
  MAX_CALENDAR_EVENTS,
  approvedAssistantActionToReducerActions,
  assistantActionToReducerActions,
  expandCalendarSchedule,
  normalizeAssistantAction,
  previewAssistantAction,
  summarizeAssistantAction,
  validateAssistantAction
} from "../src/core/assistant-actions.mjs";

function calendarAction(overrides = {}) {
  return {
    version: 1,
    name: "create_calendar_schedule",
    arguments: {
      title: "Work",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      start_time: "17:00",
      end_time: "23:00",
      weekdays: [1, 2, 3, 4, 5],
      ...overrides
    }
  };
}

test("normalizes the strict provider-neutral action envelope", () => {
  const action = normalizeAssistantAction({
    version: 1,
    name: "create_task",
    arguments: {
      title: "  File tax return  ",
      due_date: "2026-12-01",
      priority: "high"
    }
  });

  assert.deepEqual(action, {
    version: 1,
    name: "create_task",
    arguments: {
      title: "File tax return",
      due_date: "2026-12-01",
      priority: "high"
    }
  });
  assert.equal(validateAssistantAction(action), true);
});

test("rejects unknown fields, unsupported actions, and malformed values", () => {
  assert.throws(
    () => validateAssistantAction({ ...calendarAction(), provider: "example" }),
    AssistantActionValidationError
  );
  assert.throws(
    () => validateAssistantAction(calendarAction({ timezone: "Europe/London" })),
    /unknown field "timezone"/
  );
  assert.throws(
    () => validateAssistantAction({ version: 1, name: "delete_everything", arguments: {} }),
    /supported action name/
  );
  assert.throws(() => validateAssistantAction(calendarAction({ start_date: "2026-02-29" })), /invalid/);
  assert.throws(() => validateAssistantAction(calendarAction({ start_time: "5 PM" })), /HH:MM/);
  assert.throws(() => validateAssistantAction(calendarAction({ end_time: "16:59" })), /after start_time/);
  assert.throws(() => validateAssistantAction(calendarAction({ weekdays: [1, 1] })), /duplicate/);
  assert.throws(() => validateAssistantAction(calendarAction({ weekdays: [7] })), /0 \(Sunday\)/);
});

test("expands Monday-Friday work for all of 2026 with inclusive boundaries", () => {
  const events = expandCalendarSchedule(calendarAction());

  assert.equal(events.length, 261);
  assert.equal(events[0].title, "Work");
  assert.deepEqual(
    [
      new Date(events[0].start).getFullYear(),
      new Date(events[0].start).getMonth() + 1,
      new Date(events[0].start).getDate(),
      new Date(events[0].start).getHours(),
      new Date(events[0].start).getMinutes()
    ],
    [2026, 1, 1, 17, 0]
  );
  assert.deepEqual(
    [
      new Date(events.at(-1).end).getFullYear(),
      new Date(events.at(-1).end).getMonth() + 1,
      new Date(events.at(-1).end).getDate(),
      new Date(events.at(-1).end).getHours(),
      new Date(events.at(-1).end).getMinutes()
    ],
    [2026, 12, 31, 23, 0]
  );
  assert.ok(events.every((event) => {
    const day = new Date(event.start).getDay();
    return day >= 1 && day <= 5;
  }));
});

test("single calendar actions preserve local wall times", () => {
  const [event] = expandCalendarSchedule(calendarAction({
    start_date: "2026-03-29",
    end_date: "2026-03-29",
    start_time: "09:15",
    end_time: "10:45",
    weekdays: undefined
  }));
  const start = new Date(event.start);
  const end = new Date(event.end);

  assert.deepEqual(
    [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
    [2026, 3, 29, 9, 15]
  );
  assert.deepEqual([end.getHours(), end.getMinutes()], [10, 45]);
});

test("recurrence includes matching start and end dates and rejects empty ranges", () => {
  const events = expandCalendarSchedule(calendarAction({
    start_date: "2026-06-01",
    end_date: "2026-06-05"
  }));

  assert.equal(events.length, 5);
  assert.equal(new Date(events[0].start).getDate(), 1);
  assert.equal(new Date(events.at(-1).start).getDate(), 5);
  assert.throws(
    () => expandCalendarSchedule(calendarAction({
      start_date: "2026-06-06",
      end_date: "2026-06-07",
      weekdays: [1]
    })),
    /does not include/
  );
});

test("calendar expansion enforces the hard safety cap", () => {
  const action = calendarAction({
    start_date: "2021-01-01",
    end_date: "2026-12-31",
    weekdays: [0, 1, 2, 3, 4, 5, 6]
  });

  assert.equal(MAX_CALENDAR_EVENTS, 2000);
  assert.throws(() => expandCalendarSchedule(action), /more than 2000 events/);
  assert.throws(() => expandCalendarSchedule(calendarAction(), { maxEvents: 200 }), /more than 200/);
  assert.throws(() => expandCalendarSchedule(calendarAction(), { maxEvents: 2001 }), /1 to 2000/);
});

test("converts approved actions to reducer-ready actions without state mutation", () => {
  const task = assistantActionToReducerActions({
    version: 1,
    name: "create_task",
    arguments: {
      title: "Prepare presentation",
      notes: "Use the final figures",
      due_date: "2026-07-10",
      priority: "high",
      project_id: "work"
    }
  });
  const reminder = approvedAssistantActionToReducerActions({
    approved: true,
    action: {
      version: 1,
      name: "create_reminder",
      arguments: {
        title: "Call Alex",
        due_at: "2026-07-10T17:30:00+01:00",
        kind: "work"
      }
    }
  });

  assert.deepEqual(task, [{
    type: "task/add",
    payload: {
      title: "Prepare presentation",
      notes: "Use the final figures",
      dueDate: "2026-07-10",
      priority: "high",
      projectId: "work"
    }
  }]);
  assert.deepEqual(reminder, [{
    type: "reminder/add",
    payload: {
      title: "Call Alex",
      dueAt: "2026-07-10T16:30:00.000Z",
      kind: "work"
    }
  }]);
  assert.throws(
    () => approvedAssistantActionToReducerActions({ approved: false, action: calendarAction() }),
    /must be true/
  );
});

test("focus logs validate and convert to persisted focus sessions", () => {
  const actions = assistantActionToReducerActions({
    version: 1,
    name: "log_focus_session",
    arguments: {
      date: "2026-06-08",
      title: "Vibe coding",
      duration_minutes: 90,
      project: "Focus",
      tags: ["coding"],
      focus_rating: 5,
      energy: 4,
      note: "Built the assistant flow"
    }
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "session/add");
  assert.equal(actions[0].payload.session.title, "Vibe coding");
  assert.equal(actions[0].payload.session.activeMs, 90 * 60 * 1000);
  assert.equal(actions[0].payload.session.project, "Focus");
  assert.deepEqual(actions[0].payload.session.tags, ["coding"]);
  assert.equal(actions[0].payload.session.focusRating, 5);
});

test("renames and deletes only existing calendar events that match explicit constraints", () => {
  const events = [
    {
      id: "event-mon-work",
      title: "Work",
      start: new Date(2026, 5, 8, 17, 0).toISOString(),
      end: new Date(2026, 5, 8, 23, 0).toISOString()
    },
    {
      id: "event-tue-work",
      title: "Work",
      start: new Date(2026, 5, 9, 17, 0).toISOString(),
      end: new Date(2026, 5, 9, 23, 0).toISOString()
    },
    {
      id: "event-mon-chinese",
      title: "Chinese",
      start: new Date(2026, 5, 8, 0, 0).toISOString(),
      end: new Date(2026, 5, 8, 1, 0).toISOString()
    }
  ];
  const rename = {
    version: 1,
    name: "update_calendar_events",
    arguments: {
      match_title: "work",
      start_time: "17:00",
      end_time: "23:00",
      weekdays: [1],
      new_title: "Chinese"
    }
  };
  const remove = {
    version: 1,
    name: "delete_calendar_events",
    arguments: {
      match_title: "Chinese",
      start_time: "00:00",
      weekdays: [1]
    }
  };

  assert.deepEqual(assistantActionToReducerActions(rename, { events }), [{
    type: "event/update",
    payload: { id: "event-mon-work", patch: { title: "Chinese" } }
  }]);
  assert.deepEqual(assistantActionToReducerActions(remove, { events }), [{
    type: "event/delete",
    payload: {
      id: "event-mon-chinese",
      title: "Chinese",
      start: events[2].start,
      end: events[2].end
    }
  }]);
  assert.throws(
    () => assistantActionToReducerActions({ ...remove, arguments: {
      ...remove.arguments,
      start_time: "12:00"
    } }, { events }),
    /does not match/
  );
});

test("updates, deletes, and completes existing tasks and reminders by exact title", () => {
  const tasks = [{ id: "task-1", title: "File taxes" }];
  const reminders = [{ id: "reminder-1", title: "Call dentist" }];
  const taskUpdate = assistantActionToReducerActions({
    version: 1,
    name: "update_tasks",
    arguments: {
      match_title: "file taxes",
      priority: "high",
      due_date: "2026-06-12"
    }
  }, { tasks });
  const reminderUpdate = assistantActionToReducerActions({
    version: 1,
    name: "update_reminders",
    arguments: {
      match_title: "Call dentist",
      due_at: "2026-06-09T15:00:00+01:00"
    }
  }, { reminders });

  assert.deepEqual(taskUpdate, [{
    type: "task/update",
    payload: {
      id: "task-1",
      patch: { dueDate: "2026-06-12", priority: "high" }
    }
  }]);
  assert.deepEqual(reminderUpdate, [{
    type: "reminder/update",
    payload: {
      id: "reminder-1",
      patch: { dueAt: "2026-06-09T14:00:00.000Z" }
    }
  }]);
  assert.equal(assistantActionToReducerActions({
    version: 1,
    name: "complete_tasks",
    arguments: { match_title: "File taxes" }
  }, { tasks })[0].type, "task/toggle");
  assert.equal(assistantActionToReducerActions({
    version: 1,
    name: "delete_reminders",
    arguments: { match_title: "Call dentist" }
  }, { reminders })[0].type, "reminder/delete");
});

test("summary and preview expose concise UI-ready information", () => {
  const action = calendarAction({
    start_date: "2026-06-01",
    end_date: "2026-06-05"
  });
  const preview = previewAssistantAction(action, { limit: 2 });

  assert.equal(
    summarizeAssistantAction(action),
    "5 calendar events: Work, 2026-06-01 to 2026-06-05, 17:00-23:00"
  );
  assert.equal(preview.count, 5);
  assert.equal(preview.items.length, 2);
  assert.equal(preview.items[0].type, "event/add");
  assert.equal(preview.truncated, true);
});
