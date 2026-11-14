package core

import "errors"

// DeletePlan removes a plan from this PC. Its backups stay on the disk and its
// managed keys are kept (they remain in the recovery kit), so the backup can
// still be opened later with "Open a backup from another PC". Its local run
// history goes with it (finished runs were already sent as email reports).
func (a *Agent) DeletePlan(id string) error {
	if _, err := a.Store.Plan(id); err != nil {
		return errors.New("plan not found")
	}
	var active int
	if err := a.Store.DB.QueryRow(`SELECT count(*) FROM job_executions WHERE plan_id=? AND state IN ('queued','running')`, id).Scan(&active); err != nil {
		return err
	}
	if active > 0 {
		return errors.New("a backup of this plan is running; delete it after it finishes")
	}
	tx, err := a.Store.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`DELETE FROM job_executions WHERE plan_id=?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM backup_plans_cache WHERE id=?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM schedule_state WHERE plan_id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}
