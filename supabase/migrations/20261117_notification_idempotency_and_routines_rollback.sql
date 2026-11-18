-- Rollback for 20261117_notification_idempotency_and_routines.sql
-- 주의: routines / routine_runs 는 기존 운영 테이블일 수 있으므로 롤백에서 삭제하지 않는다.

drop index if exists notif_opp_customer_idx;
alter table opportunities drop column if exists notice_published_at;
