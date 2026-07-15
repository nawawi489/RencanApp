// Sumber tunggal KLIEN untuk 5 key permission yang melekat default pada role c_level/management.
// WAJIB identik dengan server: public.has_permission() dan ekspresi is_default di
// list_user_permissions_admin (migrasi 0041 — sebelumnya 0016/0017 memuat create_department).
// Mengubah salah satu = ubah ketiganya + spec permission-settings.md §5.2/§5.3; test anti-drift
// (use-profile.test.tsx K6) menjaga sisi klien. CEO bypass total (bukan via daftar ini).
// create_department SENGAJA tidak di sini (ISSUE-001, ikuti PRD §34.3): Department = admin-only,
// hanya CEO/Super Admin bypass atau grant eksplisit lewat Permission Settings.
export const MGR_DEFAULT_KEYS = [
  'create_initiative',
  'create_action_plan',
  'create_strategy',
  'manage_teams',
  'review_deadline_changes',
] as const;
