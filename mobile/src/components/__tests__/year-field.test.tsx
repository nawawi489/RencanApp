// YearField — stepper tahun + tap-to-edit (ganti input teks bebas 4 digit di New Goal).
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { YEAR_MAX, YEAR_MIN, YearField } from '../year-field';

describe('YearField', () => {
  it('menampilkan tahun terpilih & marker required', async () => {
    await render(<YearField label="Tahun Goal" value="2026" onChange={jest.fn()} required />);
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByLabelText(/Tahun Goal: 2026/)).toBeTruthy();
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('+ menaikkan tahun, − menurunkan (emit string YYYY)', async () => {
    const onChange = jest.fn();
    await render(<YearField label="Tahun Goal" value="2026" onChange={onChange} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tambah tahun Tahun Goal'));
    });
    expect(onChange).toHaveBeenLastCalledWith('2027');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Kurangi tahun Tahun Goal'));
    });
    expect(onChange).toHaveBeenLastCalledWith('2025');
  });

  it('nilai tak valid jatuh ke tahun berjalan', async () => {
    await render(<YearField label="Tahun Goal" value="" onChange={jest.fn()} />);
    expect(screen.getByText(String(new Date().getFullYear()))).toBeTruthy();
  });

  it('menonaktifkan − di batas bawah dan + di batas atas', async () => {
    const { rerender } = await render(
      <YearField label="T" value={String(YEAR_MIN)} onChange={jest.fn()} />,
    );
    const dec = screen.getByLabelText('Kurangi tahun T', { includeHiddenElements: true });
    expect(dec.props.accessibilityState?.disabled).toBe(true);

    await rerender(<YearField label="T" value={String(YEAR_MAX)} onChange={jest.fn()} />);
    const inc = screen.getByLabelText('Tambah tahun T', { includeHiddenElements: true });
    expect(inc.props.accessibilityState?.disabled).toBe(true);
  });

  it('tap angka → mode ketik, submit → commit nilai baru', async () => {
    const onChange = jest.fn();
    await render(<YearField label="Tahun Goal" value="2026" onChange={onChange} />);

    // Tap display → masuk mode edit
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Tahun Goal: 2026/));
    });
    const input = screen.getByLabelText('Ketik tahun Tahun Goal');
    expect(input).toBeTruthy();
    expect(input.props.value).toBe('2026');

    // Ketik tahun baru + submit
    await act(async () => {
      fireEvent.changeText(input, '2030');
    });
    await act(async () => {
      fireEvent(input, 'submitEditing');
    });
    expect(onChange).toHaveBeenCalledWith('2030');
  });

  it('tap-to-edit dengan input di luar batas → tidak commit', async () => {
    const onChange = jest.fn();
    await render(<YearField label="T" value="2026" onChange={onChange} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/T: 2026/));
    });
    const input = screen.getByLabelText('Ketik tahun T');

    await act(async () => {
      fireEvent.changeText(input, '1999');
    });
    await act(async () => {
      fireEvent(input, 'submitEditing');
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
