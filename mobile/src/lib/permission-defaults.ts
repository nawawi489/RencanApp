// Sumber tunggal KLIEN untuk 6 key permission yang melekat default pada role c_level/management.
// WAJIB identik dengan server: public.has_permission() (migrasi 0016:44-47) dan ekspresi is_default
// di list_user_permissions_admin (migrasi 0017). Mengubah salah satu = ubah ketiganya; test
// anti-drift (use-profile.test.tsx K6) menjaga sisi klien. CEO bypass total (bukan via daftar ini).
export const MGR_DEFAULT_KEYS = [
  'create_initiative',
  'create_action_plan',
  'create_strategy',
  'create_department',
  'manage_teams',
  'review_deadline_changes',
] as const;
