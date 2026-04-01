# Changelog

All notable changes to this project will be documented in this file.

## [2026-04-01]

### Added

- Tenant Edit Details flow in maintenance for pending requests only.
- Edit modal support for tenant-side update of title, description, priority, and proof files.
- Maintenance realtime reliability improvements:
  - Realtime subscription listener.
  - Focus-based refresh when opening the maintenance tab.
  - Polling fallback for unstable connections.
- Maintenance feedback flow for completed requests.
- End-stay guards for both tenant and landlord flows to block contract end when unresolved/pending payments exist.
- Automatic maintenance cancellation logic when occupancy end is approved/applied.

### Changed

- Tenant feedback action visibility changed from closed status to completed status.
- Feedback display placement moved to the bottom of each maintenance request card.
- Landlord pending-state action label beside Mark Scheduled changed from Cancel to Reject.
- Maintenance status checks normalized for safer UI behavior (handles casing/format variance).

### Fixed

- Fixed tenant Edit Details button not appearing reliably for pending requests.
- Fixed feedback submission not showing immediately by applying local state update after submit.
- Fixed notification RLS issues by avoiding tenant-side direct notification inserts in maintenance flows.
- Added backend notification fallback paths for maintenance/payment-related notification delivery.
- Improved recipient resolution in maintenance billing/notification paths for family-member request scenarios.

### Optimized

- Reduced duplicate maintenance sync calls with in-flight sync guard.
- Improved maintenance screen refresh behavior to remain responsive on slower networks.
- Improved maintenance modal UX and action clarity for cost logging.

### Removed

- Removed tenant-side notification insert attempts in maintenance paths that violate RLS.

### Notes

- Pending payment statuses currently treated as unresolved for end-stay checks:
  - pending
  - unpaid
  - rejected
  - pending_confirmation
