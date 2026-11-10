package core

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"time"
)

// NextDue returns the first scheduled time strictly after `after`, in
// after's location (the PC's local time). Manual plans have none.
func NextDue(s Schedule, after time.Time) (time.Time, bool) {
	loc := after.Location()
	switch s.Kind {
	case "hourly":
		// Truncate works on absolute time; IST is +5:30, so use the wall clock.
		y, m, d := after.Date()
		return time.Date(y, m, d, after.Hour(), 0, 0, 0, loc).Add(time.Hour), true
	case "daily", "weekly":
		hh, mm := clock(s.Time)
		days := map[int]bool{}
		for _, d := range s.Days {
			days[d] = true
		}
		y, m, d := after.Date()
		for i := 0; i <= 8; i++ {
			c := time.Date(y, m, d+i, hh, mm, 0, 0, loc)
			if !c.After(after) {
				continue
			}
			if s.Kind == "daily" || days[int(c.Weekday())] {
				return c, true
			}
		}
	}
	return time.Time{}, false
}

func clock(hhmm string) (int, int) {
	if len(hhmm) != 5 {
		return 0, 0
	}
	h, _ := strconv.Atoi(hhmm[:2])
	m, _ := strconv.Atoi(hhmm[3:])
	return h, m
}

func (a *Agent) scheduleState(planID string) (time.Time, bool, error) {
	var raw string
	err := a.Store.DB.QueryRow(`SELECT last_due_at FROM schedule_state WHERE plan_id=?`, planID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	return t, err == nil, err
}

func (a *Agent) setScheduleState(planID string, t time.Time) error {
	_, err := a.Store.DB.Exec(`INSERT INTO schedule_state(plan_id,last_due_at) VALUES(?,?) ON CONFLICT(plan_id) DO UPDATE SET last_due_at=excluded.last_due_at`, planID, t.UTC().Format(time.RFC3339Nano))
	return err
}

// NextRuns maps plan IDs to their next scheduled backup time.
func (a *Agent) NextRuns() (map[string]time.Time, error) {
	plans, err := a.Store.Plans()
	if err != nil {
		return nil, err
	}
	out := map[string]time.Time{}
	for _, p := range plans {
		last, ok, err := a.scheduleState(p.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			last = a.now()
		}
		if next, has := NextDue(p.Schedule, last.In(time.Local)); has {
			out[p.ID] = next
		}
	}
	return out, nil
}

// SchedulerTick queues every plan whose scheduled time has passed. Times
// missed while the PC was off collapse into one run, started now. Paused
// memberships skip the run; nothing piles up for later.
func (a *Agent) SchedulerTick() (queued []string, err error) {
	plans, err := a.Store.Plans()
	if err != nil {
		return nil, err
	}
	nowT := a.now()
	for _, p := range plans {
		if p.RestoreOnly || p.Schedule.Kind == "" || p.Schedule.Kind == "manual" {
			continue
		}
		last, ok, err := a.scheduleState(p.ID)
		if err != nil {
			return queued, err
		}
		if !ok {
			// First sighting: count from now, run at the next scheduled time.
			if err = a.setScheduleState(p.ID, nowT); err != nil {
				return queued, err
			}
			continue
		}
		due, has := NextDue(p.Schedule, last.In(time.Local))
		if !has || nowT.Before(due) {
			continue
		}
		if err = a.setScheduleState(p.ID, nowT); err != nil {
			return queued, err
		}
		if a.requireFull() != nil {
			continue
		}
		if _, err := a.Enqueue(p.ID); err == nil {
			queued = append(queued, p.ID)
		}
	}
	return queued, nil
}

// SchedulerLoop checks schedules every minute until ctx is cancelled.
func (a *Agent) SchedulerLoop(ctx context.Context) {
	for {
		_, _ = a.SchedulerTick()
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Minute):
		}
	}
}
