// Fase 8 — pesan akses ditolak reusable untuk Settings subsection yang ter-gate permission.
import { Text } from 'react-native-css/components';

import { SectionCard } from '@/components/ui';

export function AccessDenied({ message }: { message?: string }) {
  return (
    <SectionCard>
      <Text className="text-base font-semibold text-black dark:text-white">
        Anda tidak memiliki akses
      </Text>
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        {message ?? 'Bagian ini hanya untuk pemegang izin yang sesuai.'}
      </Text>
    </SectionCard>
  );
}
