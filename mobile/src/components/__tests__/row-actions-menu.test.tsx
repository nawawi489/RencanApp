// RowActionsMenu (UI-G-009) — bottom-sheet aksi sekunder per-card.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { RowActionsMenu, type RowAction } from '../row-actions-menu';

jest.setTimeout(30000);

function Harness({ items, title }: { items: RowAction[]; title?: string }) {
  const [open, setOpen] = useState(true);
  return <RowActionsMenu open={open} onClose={() => setOpen(false)} title={title} items={items} />;
}

describe('RowActionsMenu', () => {
  it('[1] render semua items + tombol Tutup', async () => {
    const items: RowAction[] = [
      { label: 'Ubah', onPress: jest.fn() },
      { label: 'Arsipkan', onPress: jest.fn(), destructive: true },
    ];
    await render(<Harness items={items} title="Goal X" />);
    expect(screen.getByText('Goal X')).toBeTruthy();
    expect(screen.getByLabelText('Ubah')).toBeTruthy();
    expect(screen.getByLabelText('Arsipkan')).toBeTruthy();
    expect(screen.getByLabelText('Tutup menu aksi')).toBeTruthy();
  });

  it('[2] tekan item → onClose dipanggil dulu, lalu onPress', async () => {
    const order: string[] = [];
    const items: RowAction[] = [
      {
        label: 'Ubah',
        onPress: () => order.push('press'),
      },
    ];
    // Tidak pakai Harness karena perlu observe onClose order.
    const onClose = jest.fn(() => order.push('close'));
    await render(
      <RowActionsMenu open={true} onClose={onClose} items={items} />,
    );
    fireEvent.press(screen.getByLabelText('Ubah'));
    expect(order).toEqual(['close', 'press']);
  });

});
