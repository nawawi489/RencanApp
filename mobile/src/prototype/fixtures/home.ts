export const prototypeHome = {
  title: 'Rencanaapp',
  kicker: 'Pusat Kendali Hari Ini',
  dateLabel: 'Selasa, 16 Juni',
  greeting: 'Selamat pagi, Rina.',
  heroBody:
    'Hari ini ada 3 prioritas utama. Kerjakan yang paling dekat ke target, sisanya tetap tercatat rapi.',
  priorities: [
    { icon: '!', title: 'Lewat deadline', body: '1 Action Plan perlu bukti final.' },
    { icon: 'R', title: 'Butuh Review', body: '3 bukti menunggu keputusan.' },
    { icon: '65%', title: 'Gap KPI Area', body: 'Kurang 1.060 customer.' },
  ],
  focusItems: ['Closing stok bulanan', 'Review promo paket hemat', 'Validasi KPI area Parepare'],
  snapshotItems: ['Marketing: 3 review pending', 'Operasional: 2 evidence masuk', 'Sales: target harian 72%'],
} as const;
