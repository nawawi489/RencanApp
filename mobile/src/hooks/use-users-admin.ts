// Hook admin — Tambah User. Pemanggil tipis di atas @/lib/users-admin (pola use-permissions-admin).
// Sukses meng-invalidate daftar anggota org (list User & Permission, picker, People).
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createOrgUser, type CreateOrgUserInput } from '@/lib/users-admin';

export function useCreateUserAdmin() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (input: CreateOrgUserInput) => createOrgUser(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-profiles'] });
      qc.invalidateQueries({ queryKey: ['org-profiles-with-roles'] });
    },
  });
  return {
    createUser: (input: CreateOrgUserInput) => m.mutateAsync(input),
    isPending: m.isPending,
  };
}
