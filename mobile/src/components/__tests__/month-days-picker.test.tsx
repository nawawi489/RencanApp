import { fireEvent, render, screen } from '@testing-library/react-native';

import { MonthDaysPicker } from '../month-days-picker';

describe('MonthDaysPicker', () => {
  it('menampilkan 31 tombol tanggal', async () => {
    await render(<MonthDaysPicker label="Tanggal" value={[]} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Tanggal 1')).toBeTruthy();
    expect(screen.getByLabelText('Tanggal 31')).toBeTruthy();
  });

  it('menandai tanggal aktif dengan checked=true', async () => {
    await render(<MonthDaysPicker label="Tanggal" value={[1, 15]} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Tanggal 1').props.accessibilityState?.checked).toBe(true);
    expect(screen.getByLabelText('Tanggal 15').props.accessibilityState?.checked).toBe(true);
    expect(screen.getByLabelText('Tanggal 2').props.accessibilityState?.checked).toBe(false);
  });

  it('toggle menambah tanggal baru (sorted)', async () => {
    const onChange = jest.fn();
    await render(<MonthDaysPicker label="Tanggal" value={[15]} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Tanggal 1'));
    expect(onChange).toHaveBeenCalledWith([1, 15]);
  });

  it('toggle menghapus tanggal yang sudah aktif', async () => {
    const onChange = jest.fn();
    await render(<MonthDaysPicker label="Tanggal" value={[1, 15]} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Tanggal 15'));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it('menampilkan marker required', async () => {
    await render(<MonthDaysPicker label="Tanggal" value={[]} onChange={jest.fn()} required />);
    expect(screen.getByText('*')).toBeTruthy();
  });
});
